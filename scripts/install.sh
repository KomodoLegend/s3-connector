#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PREFIX="${PREFIX:-$HOME/.local}"
export PATH="${HOME}/.local/go/bin:${PATH}"

cd "$ROOT"
echo "Building s3-connector…"
go build -o s3-connector .

echo "Installing to ${PREFIX}…"
install -Dm755 s3-connector "${PREFIX}/bin/s3-connector"
install -Dm644 packaging/s3-connector.desktop "${PREFIX}/share/applications/s3-connector.desktop"
install -Dm644 packaging/icons/s3-connector.svg "${PREFIX}/share/icons/hicolor/scalable/apps/s3-connector.svg"

# GNOME/desktop launches often lack ~/.local/bin on PATH — use absolute Exec.
sed -i "s|^Exec=.*|Exec=${PREFIX}/bin/s3-connector|" \
  "${PREFIX}/share/applications/s3-connector.desktop"

update-desktop-database "${PREFIX}/share/applications" 2>/dev/null || true
gtk-update-icon-cache -f -t "${PREFIX}/share/icons/hicolor" 2>/dev/null || true

echo
echo "Installed."
echo "  Binary:  ${PREFIX}/bin/s3-connector"
echo "  Desktop: ${PREFIX}/share/applications/s3-connector.desktop"
echo "  Icon:    ${PREFIX}/share/icons/hicolor/scalable/apps/s3-connector.svg"
echo
echo "Open Activities and search for \"S3 Connector\"."
echo "Or run: ${PREFIX}/bin/s3-connector"
