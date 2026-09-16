package server

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/alexey-stepanov/s3-connector/internal/config"
	"github.com/alexey-stepanov/s3-connector/internal/s3client"
	"github.com/aws/aws-sdk-go-v2/aws"
)

type Server struct {
	store *config.Store
	mux   *http.ServeMux
}

func New(store *config.Store) *Server {
	s := &Server{store: store, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) Handler() http.Handler { return s.mux }

func (s *Server) routes() {
	s.mux.HandleFunc("GET /api/health", s.handleHealth)
	s.mux.HandleFunc("GET /api/connections", s.handleList)
	s.mux.HandleFunc("GET /api/connections/{id}", s.handleGet)
	s.mux.HandleFunc("POST /api/connections", s.handleUpsert)
	s.mux.HandleFunc("PUT /api/connections/{id}", s.handleUpdate)
	s.mux.HandleFunc("DELETE /api/connections/{id}", s.handleDelete)

	s.mux.HandleFunc("POST /api/connections/{id}/test", s.handleTest)
	s.mux.HandleFunc("GET /api/connections/{id}/buckets", s.handleBuckets)
	s.mux.HandleFunc("POST /api/connections/{id}/buckets", s.handleCreateBucket)
	s.mux.HandleFunc("DELETE /api/connections/{id}/buckets", s.handleDeleteBucket)
	s.mux.HandleFunc("GET /api/connections/{id}/objects", s.handleObjects)
	s.mux.HandleFunc("GET /api/connections/{id}/download", s.handleDownload)
	s.mux.HandleFunc("POST /api/connections/{id}/upload", s.handleUpload)

	s.mux.HandleFunc("POST /api/export", s.handleExport)
	s.mux.HandleFunc("POST /api/import", s.handleImport)

	root := staticFS()
	s.mux.Handle("GET /static/", http.StripPrefix("/static/", http.FileServer(http.FS(root))))
	s.mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		data, err := fs.ReadFile(root, "index.html")
		if err != nil {
			http.Error(w, "index not found", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(data)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"store":    s.store.Path(),
		"count":    len(s.store.List()),
	})
}

func (s *Server) handleList(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, s.store.List())
}

func (s *Server) handleGet(w http.ResponseWriter, r *http.Request) {
	c, err := s.store.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (s *Server) handleUpsert(w http.ResponseWriter, r *http.Request) {
	var c config.Connection
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	saved, err := s.store.Upsert(c)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"connection": saved,
	})
}

func (s *Server) handleUpdate(w http.ResponseWriter, r *http.Request) {
	var c config.Connection
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	c.ID = r.PathValue("id")
	saved, err := s.store.Upsert(c)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"connection": saved,
	})
}

func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Delete(r.PathValue("id")); err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) withClient(w http.ResponseWriter, r *http.Request, fn func(context.Context, *s3client.Client, config.Connection)) {
	c, err := s.store.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	cli, err := s3client.New(ctx, c)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	fn(ctx, cli, c)
}

func (s *Server) handleTest(w http.ResponseWriter, r *http.Request) {
	s.withClient(w, r, func(ctx context.Context, cli *s3client.Client, c config.Connection) {
		if err := cli.Test(ctx); err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":         true,
			"connection": c,
		})
	})
}

func (s *Server) handleBuckets(w http.ResponseWriter, r *http.Request) {
	s.withClient(w, r, func(ctx context.Context, cli *s3client.Client, _ config.Connection) {
		buckets, err := cli.ListBuckets(ctx)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, buckets)
	})
}

func (s *Server) handleCreateBucket(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}
	c, err := s.store.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	cli, err := s3client.New(ctx, c)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := cli.CreateBucket(ctx, req.Name); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": req.Name})
}

func (s *Server) handleObjects(w http.ResponseWriter, r *http.Request) {
	bucket := r.URL.Query().Get("bucket")
	if bucket == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bucket query required"})
		return
	}
	prefix := r.URL.Query().Get("prefix")
	maxKeys := int32(200)
	if v := r.URL.Query().Get("max"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxKeys = int32(n)
		}
	}
	s.withClient(w, r, func(ctx context.Context, cli *s3client.Client, _ config.Connection) {
		objs, err := cli.ListObjects(ctx, bucket, prefix, maxKeys)
		if err != nil {
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, objs)
	})
}

func (s *Server) handleDownload(w http.ResponseWriter, r *http.Request) {
	bucket := r.URL.Query().Get("bucket")
	key := r.URL.Query().Get("key")
	if bucket == "" || key == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bucket and key required"})
		return
	}
	c, err := s.store.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()
	cli, err := s3client.New(ctx, c)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	out, err := cli.Download(ctx, bucket, key)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	defer out.Body.Close()

	name := key
	if i := strings.LastIndex(key, "/"); i >= 0 && i+1 < len(key) {
		name = key[i+1:]
	}
	if name == "" {
		name = "download"
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(name, `"`, "")+`"`)
	if out.ContentType != nil {
		w.Header().Set("Content-Type", aws.ToString(out.ContentType))
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}
	if out.ContentLength != nil {
		w.Header().Set("Content-Length", strconv.FormatInt(aws.ToInt64(out.ContentLength), 10))
	}
	_, _ = io.Copy(w, out.Body)
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	c, err := s.store.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := r.ParseMultipartForm(512 << 20); err != nil { // 512MB
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "multipart: " + err.Error()})
		return
	}
	bucket := r.FormValue("bucket")
	prefix := r.FormValue("prefix")
	if bucket == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "bucket required"})
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file required"})
		return
	}
	defer file.Close()

	keyName := hdr.Filename
	if keyName == "" {
		keyName = "upload.bin"
	}
	prefix = strings.TrimLeft(prefix, "/")
	key := keyName
	if prefix != "" {
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		key = prefix + keyName
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()
	cli, err := s3client.New(ctx, c)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	ct := hdr.Header.Get("Content-Type")
	if err := cli.Upload(ctx, bucket, key, file, hdr.Size, ct); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "key": key})
}

func (s *Server) handleDeleteBucket(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		ConfirmName string `json:"confirmName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if req.Name == "" || req.ConfirmName != req.Name {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "для удаления введите точное имя бакета"})
		return
	}
	c, err := s.store.Get(r.PathValue("id"))
	if err != nil {
		writeErr(w, err)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Minute)
	defer cancel()
	cli, err := s3client.New(ctx, c)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	if err := cli.DeleteBucket(ctx, req.Name); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "name": req.Name})
}

type exportRequest struct {
	ConnectionIDs  []string `json:"connectionIds"`
	IncludeSecrets bool     `json:"includeSecrets"`
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	var req exportRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	doc, err := s.store.Export(config.ExportOptions{
		ConnectionIDs:  req.ConnectionIDs,
		IncludeSecrets: req.IncludeSecrets,
	})
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	name := "s3-connections.json"
	if len(req.ConnectionIDs) == 1 {
		if c, err := s.store.Get(req.ConnectionIDs[0]); err == nil {
			safe := strings.Map(func(r rune) rune {
				if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
					return r
				}
				return '-'
			}, c.Name)
			if safe != "" {
				name = "s3-" + safe + ".json"
			}
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(doc)
}

func (s *Server) handleImport(w http.ResponseWriter, r *http.Request) {
	replace := r.URL.Query().Get("replace") == "1" || r.URL.Query().Get("replace") == "true"
	raw, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var doc config.StoreFile
	if err := json.Unmarshal(raw, &doc); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}
	added, updated, err := s.store.Import(doc, replace)
	if err != nil {
		writeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"added": added, "updated": updated})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	if errors.Is(err, config.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}
