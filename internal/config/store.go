package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
)

const storeVersion = 1

var ErrNotFound = errors.New("connection not found")

// Store persists connections as a single JSON file.
type Store struct {
	mu   sync.RWMutex
	path string
	data StoreFile
}

// DefaultPath returns ~/.config/s3-connector/connections.json
func DefaultPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "s3-connector", "connections.json"), nil
}

func Open(path string) (*Store, error) {
	s := &Store{path: path}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			s.data = StoreFile{Version: storeVersion, Connections: []Connection{}}
			return s, s.saveLocked()
		}
		return nil, err
	}
	if len(raw) == 0 {
		s.data = StoreFile{Version: storeVersion, Connections: []Connection{}}
		return s, nil
	}
	if err := json.Unmarshal(raw, &s.data); err != nil {
		return nil, fmt.Errorf("parse store: %w", err)
	}
	if s.data.Connections == nil {
		s.data.Connections = []Connection{}
	}
	s.data.Version = storeVersion
	return s, nil
}

func (s *Store) Path() string { return s.path }

func (s *Store) List() []Connection {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Connection, len(s.data.Connections))
	for i, c := range s.data.Connections {
		out[i] = cloneConnection(c)
	}
	return out
}

func (s *Store) Get(id string) (Connection, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, c := range s.data.Connections {
		if c.ID == id {
			return cloneConnection(c), nil
		}
	}
	return Connection{}, ErrNotFound
}

func cloneConnection(c Connection) Connection {
	cp := c
	if c.Buckets != nil {
		cp.Buckets = append([]BucketCfg(nil), c.Buckets...)
	} else {
		cp.Buckets = []BucketCfg{}
	}
	return cp
}

func (s *Store) Upsert(c Connection) (Connection, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UTC()
	if c.ID == "" {
		c.ID = uuid.NewString()
		c.CreatedAt = now
	}
	c.UpdatedAt = now
	// Buckets are never persisted — fetched live when opening a connection.
	c.Buckets = []BucketCfg{}
	if c.Region == "" {
		c.Region = "us-east-1"
	}

	found := false
	for i, existing := range s.data.Connections {
		if existing.ID == c.ID {
			c.CreatedAt = existing.CreatedAt
			s.data.Connections[i] = c
			found = true
			break
		}
	}
	if !found {
		if c.CreatedAt.IsZero() {
			c.CreatedAt = now
		}
		s.data.Connections = append(s.data.Connections, c)
	}
	if err := s.saveLocked(); err != nil {
		return Connection{}, err
	}
	return c, nil
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	idx := -1
	for i, c := range s.data.Connections {
		if c.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return ErrNotFound
	}
	s.data.Connections = append(s.data.Connections[:idx], s.data.Connections[idx+1:]...)
	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	s.data.Version = storeVersion
	raw, err := json.MarshalIndent(s.data, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, append(raw, '\n'), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Export builds a StoreFile for selected (or all) connections.
func (s *Store) Export(opts ExportOptions) (StoreFile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now().UTC()
	out := StoreFile{Version: storeVersion, ExportedAt: &now, Connections: []Connection{}}

	want := map[string]struct{}{}
	for _, id := range opts.ConnectionIDs {
		want[id] = struct{}{}
	}
	filter := len(want) > 0

	for _, c := range s.data.Connections {
		if filter {
			if _, ok := want[c.ID]; !ok {
				continue
			}
		}
		cp := c
		if !opts.IncludeSecrets {
			cp.AccessKeyID = ""
			cp.SecretAccessKey = ""
		}
		cp.Buckets = []BucketCfg{}
		out.Connections = append(out.Connections, cp)
	}
	if filter && len(out.Connections) == 0 {
		return StoreFile{}, fmt.Errorf("no matching connections to export")
	}
	return out, nil
}

// Import merges connections from JSON. Same ID updates; empty ID creates new.
func (s *Store) Import(doc StoreFile, replace bool) (added, updated int, err error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if replace {
		s.data.Connections = nil
	}
	now := time.Now().UTC()
	for _, incoming := range doc.Connections {
		if incoming.Name == "" && incoming.Endpoint == "" {
			continue
		}
		incoming.Buckets = []BucketCfg{}
		if incoming.Region == "" {
			incoming.Region = "us-east-1"
		}

		idx := -1
		if incoming.ID != "" {
			for i, existing := range s.data.Connections {
				if existing.ID == incoming.ID {
					idx = i
					break
				}
			}
		}
		if idx >= 0 {
			incoming.CreatedAt = s.data.Connections[idx].CreatedAt
			incoming.UpdatedAt = now
			s.data.Connections[idx] = incoming
			updated++
			continue
		}
		if incoming.ID == "" {
			incoming.ID = uuid.NewString()
		}
		incoming.CreatedAt = now
		incoming.UpdatedAt = now
		s.data.Connections = append(s.data.Connections, incoming)
		added++
	}
	return added, updated, s.saveLocked()
}
