#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-$HOME/.local}"

rm -f "${PREFIX}/bin/s3-connector"
rm -f "${PREFIX}/share/applications/s3-connector.desktop"
rm -f "${PREFIX}/share/icons/hicolor/scalable/apps/s3-connector.svg"

update-desktop-database "${PREFIX}/share/applications" 2>/dev/null || true
gtk-update-icon-cache -f -t "${PREFIX}/share/icons/hicolor" 2>/dev/null || true

echo "Uninstalled from ${PREFIX}"
