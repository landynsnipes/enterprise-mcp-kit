#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
target="$root/.env"
if [[ -f "$target" ]]; then echo "GitLab environment already exists at $target"; exit 0; fi
umask 077
secret="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))')"
tmp="$target.tmp.$$"
printf 'GITLAB_ROOT_PASSWORD=%s\n' "$secret" >"$tmp"
chmod 600 "$tmp"
mv "$tmp" "$target"
echo 'gitlab-local-env=generated mode=600'
