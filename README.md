# S3 Connector

Local desktop app for managing S3-compatible connections (AWS, MinIO, Ceph, …): endpoints, buckets, object browser, JSON export/import.

On Linux it runs as a **standalone window** (Chrome/Chromium app mode or Epiphany) and can be installed into the Apps menu.

## Features

- Multiple independent S3 connections
- Edit settings: endpoint, region, keys, SSL, path-style
- Live bucket list from S3 when a connection is opened
- Right-click menu: view data, object browser, test, export, delete
- JSON export/import (merge or replace)
- UI language: RU / EN

## Install (Fedora / GNOME)

```bash
./scripts/install.sh
```

Then open **Activities → S3 Connector**.

This installs:

| Path | What |
|------|------|
| `~/.local/bin/s3-connector` | binary |
| `~/.local/share/applications/s3-connector.desktop` | Apps menu entry |
| `~/.local/share/icons/hicolor/scalable/apps/s3-connector.svg` | icon |

Uninstall:

```bash
./scripts/uninstall.sh
```

## Run without installing

```bash
go build -o s3-connector .
./s3-connector
```

Closing the app window stops the background local server.

Flags:

| Flag | Default | Description |
|------|---------|-------------|
| `-addr` | `127.0.0.1:8787` | HTTP listen address (falls back to a free port if busy) |
| `-store` | `~/.config/s3-connector/connections.json` | settings file |
| `-no-open` | `false` | server only, no window |
| `-browser` | `false` | open default browser tab instead of app window |

## JSON format

```json
{
  "version": 1,
  "connections": [
    {
      "id": "optional-uuid",
      "name": "Prod MinIO",
      "endpoint": "https://minio.example.com",
      "region": "us-east-1",
      "accessKeyId": "...",
      "secretAccessKey": "...",
      "useSSL": true,
      "pathStyle": true,
      "buckets": [
        { "name": "logs", "prefix": "2026/", "notes": "" }
      ],
      "notes": ""
    }
  ]
}
```

The store file is created automatically on first run with mode `0600`.
