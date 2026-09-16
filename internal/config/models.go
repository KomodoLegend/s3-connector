package config

import "time"

// BucketCfg describes a bucket within an S3 connection.
type BucketCfg struct {
	Name   string `json:"name"`
	Prefix string `json:"prefix,omitempty"`
	Notes  string `json:"notes,omitempty"`
}

// Connection is one S3 endpoint profile with optional known buckets.
type Connection struct {
	ID              string      `json:"id"`
	Name            string      `json:"name"`
	Endpoint        string      `json:"endpoint"`
	Region          string      `json:"region"`
	AccessKeyID     string      `json:"accessKeyId"`
	SecretAccessKey string      `json:"secretAccessKey"`
	UseSSL          bool        `json:"useSSL"`
	PathStyle       bool        `json:"pathStyle"`
	Buckets         []BucketCfg `json:"buckets"`
	Notes           string      `json:"notes,omitempty"`
	CreatedAt       time.Time   `json:"createdAt"`
	UpdatedAt       time.Time   `json:"updatedAt"`
}

// StoreFile is the on-disk / export document root.
type StoreFile struct {
	Version     int          `json:"version"`
	ExportedAt  *time.Time   `json:"exportedAt,omitempty"`
	Connections []Connection `json:"connections"`
}

// ExportOptions controls what gets written to JSON.
type ExportOptions struct {
	// ConnectionIDs empty = export all.
	ConnectionIDs []string `json:"connectionIds,omitempty"`
	// IncludeSecrets if false, access/secret keys are blanked.
	IncludeSecrets bool `json:"includeSecrets"`
}
