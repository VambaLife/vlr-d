#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${BACKUP_DIR:?Set BACKUP_DIR to an external absolute path}"

case "$BACKUP_DIR" in
  "$ROOT_DIR"|"$ROOT_DIR"/*)
    printf '%s\n' 'BACKUP_DIR must be outside the project directory.' >&2
    exit 1
    ;;
esac

if [[ "$BACKUP_DIR" != /* ]]; then
  printf '%s\n' 'BACKUP_DIR must be an absolute path.' >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/vlr-dmitrov-$TIMESTAMP.tar.gz"
CHECKSUM="$ARCHIVE.sha256"

tar -C "$ROOT_DIR" -czf "$ARCHIVE" \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./backup' \
  --exclude='./logs' \
  --exclude='./node_modules' \
  --exclude='./vendor' \
  .

sha256sum "$ARCHIVE" > "$CHECKSUM"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'vlr-dmitrov-*.tar.gz' -o -name 'vlr-dmitrov-*.tar.gz.sha256' \) -mtime +30 -delete

printf 'Backup created: %s\n' "$ARCHIVE"
