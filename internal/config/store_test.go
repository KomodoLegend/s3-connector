package config_test

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/alexey-stepanov/s3-connector/internal/config"
)

func TestStoreCRUDExportImport(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "connections.json")
	store, err := config.Open(path)
	if err != nil {
		t.Fatal(err)
	}

	c1, err := store.Upsert(config.Connection{
		Name:            "a",
		Endpoint:        "http://localhost:9000",
		AccessKeyID:     "ak",
		SecretAccessKey: "sk",
		UseSSL:          false,
		PathStyle:       true,
		Buckets:         []config.BucketCfg{{Name: "b1"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	c2, err := store.Upsert(config.Connection{
		Name:     "b",
		Endpoint: "https://s3.example.com",
		Buckets:  []config.BucketCfg{{Name: "logs", Prefix: "x/"}},
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(store.List()) != 2 {
		t.Fatalf("want 2, got %d", len(store.List()))
	}

	all, err := store.Export(config.ExportOptions{IncludeSecrets: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(all.Connections) != 2 {
		t.Fatalf("export all: %d", len(all.Connections))
	}

	one, err := store.Export(config.ExportOptions{
		ConnectionIDs:  []string{c1.ID},
		IncludeSecrets: false,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(one.Connections) != 1 || one.Connections[0].ID != c1.ID {
		t.Fatalf("export one failed: %+v", one)
	}
	if one.Connections[0].SecretAccessKey != "" || one.Connections[0].AccessKeyID != "" {
		t.Fatal("secrets should be blanked")
	}

	raw, _ := json.Marshal(one)
	store2, err := config.Open(filepath.Join(dir, "other.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc config.StoreFile
	if err := json.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	added, updated, err := store2.Import(doc, false)
	if err != nil || added != 1 || updated != 0 {
		t.Fatalf("import: added=%d updated=%d err=%v", added, updated, err)
	}

	if err := store.Delete(c2.ID); err != nil {
		t.Fatal(err)
	}
	if len(store.List()) != 1 {
		t.Fatal("delete failed")
	}
}
