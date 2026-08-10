#!/usr/bin/env bash
set -Eeuo pipefail

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="${BACKUP_ROOT:-/root/backups/pivdoner-migration}"
target="${backup_root}/${stamp}"
install -d -m 700 "$target"

for directory in pivnoy_doner govno1; do
  if [[ -d "/root/${directory}" ]]; then
    tar -C /root -czf "${target}/${directory}.tar.gz" "$directory"
  fi
done

for volume in pivnoy_doner_db_data govno1_backend-data govno1_bot-data; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then
    docker run --rm \
      -v "${volume}:/source:ro" \
      -v "${target}:/backup" \
      alpine:3.22 \
      sh -c "cd /source && tar -czf /backup/${volume}.tar.gz ."
  fi
done

if docker inspect pivdoner-db >/dev/null 2>&1; then
  env_file="${PIVDONER_ENV_FILE:-/opt/pivdoner/deploy/.env}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
    docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" pivdoner-db \
      pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
      > "${target}/pivdoner-postgres.dump"
  fi
fi

(
  cd "$target"
  find . -maxdepth 1 -type f ! -name SHA256SUMS -printf '%P\0' \
    | sort -z \
    | xargs -0 -r sha256sum \
    > SHA256SUMS
  sha256sum -c SHA256SUMS
)

printf 'Backup created: %s\n' "$target"
