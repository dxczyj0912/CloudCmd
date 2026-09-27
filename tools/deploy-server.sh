#!/usr/bin/env bash
# Run on the server as the owner of /opt/cloudcmd. The archive is produced by
# git archive after the verify job passes; runtime data lives in a Docker volume.
set -Eeuo pipefail

archive="${1:?missing source archive}"
expected="${2:?missing SHA-256}"
commit="${3:?missing Git commit}"
live=/opt/cloudcmd
backups=/opt/cloudcmd-backups

[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid archive digest' >&2; exit 2; }
[[ "$commit" =~ ^[0-9a-f]{40,64}$ ]] || { echo 'Invalid Git commit' >&2; exit 2; }
[[ -f "$archive" ]] || { echo 'Source archive not found' >&2; exit 2; }
actual="$(sha256sum "$archive" | cut -d ' ' -f1)"
[[ "$actual" == "$expected" ]] || { echo 'Source archive digest mismatch' >&2; exit 2; }
[[ ! -L "$live" ]] || { echo '/opt/cloudcmd must be a directory, not a symlink' >&2; exit 2; }

mkdir -p "$backups"
stage="$(mktemp -d /opt/.cloudcmd-stage.XXXXXX)"
backup="$backups/$(date -u +%Y%m%dT%H%M%SZ)-${expected:0:12}"
tar -xzf "$archive" -C "$stage" --no-same-owner
[[ -f "$stage/docker-compose.yml" && -f "$stage/server.js" ]] || {
  echo 'Archive lacks deployment files' >&2; exit 2;
}

# Preserve the existing signed APKs and server-local configuration. A previous
# deployment may have stored its APK in the repository root.
mkdir -p "$stage/apk"
if [[ -d "$live/apk" ]]; then cp -a "$live/apk/." "$stage/apk/"; fi
if [[ -f "$live/.env" ]]; then cp -p "$live/.env" "$stage/.env"; fi
if [[ -d "$live" ]]; then
  for file in "$live"/CloudCmd-*.apk; do
    if [[ -f "$file" ]]; then cp -n "$file" "$stage/apk/"; fi
  done
fi
printf '%s\n' "$commit" > "$stage/.deployment-commit"

docker compose -p cloudcmd --project-directory "$stage" -f "$stage/docker-compose.yml" config --quiet
docker compose -p cloudcmd --project-directory "$stage" -f "$stage/docker-compose.yml" build

backup="$(mktemp -d "$backups/$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}.XXXXXX")"
had_previous=false
if [[ -d "$live" ]]; then
  mv "$live" "$backup/previous"
  had_previous=true
fi
mv "$stage" "$live"

rollback() {
  echo 'Deployment failed health check; restoring previous version.' >&2
  if [[ "$had_previous" == true ]]; then
    mv "$live" "$backup/failed"
    mv "$backup/previous" "$live"
    docker compose -p cloudcmd --project-directory "$live" -f "$live/docker-compose.yml" up -d --build --force-recreate || true
  else
    echo 'First deployment has no previous version to restore.' >&2
  fi
  exit 1
}

docker compose -p cloudcmd --project-directory "$live" -f "$live/docker-compose.yml" up -d --no-build --force-recreate || rollback
healthy=false
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 5 http://127.0.0.1:8787/api/health | grep -q '"ok":true'; then
    healthy=true
    break
  fi
  sleep 3
done
[[ "$healthy" == true ]] || rollback

rm -f "$archive"
echo "CloudCmd deployed: ${expected:0:12}; previous files: $backup"
