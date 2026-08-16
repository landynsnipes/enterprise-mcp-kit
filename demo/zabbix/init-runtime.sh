#!/usr/bin/env sh
set -eu
umask 077
mkdir -p .runtime
db_secret="$(openssl rand -hex 24)"
admin_secret="$(openssl rand -base64 30 | tr -d '\n')"
{
  printf 'POSTGRES_DB=zabbix\n'
  printf 'POSTGRES_USER=zabbix\n'
  printf 'POSTGRES_PASSWORD=%s\n' "$db_secret"
  printf 'ZABBIX_ADMIN_PASSWORD=%s\n' "$admin_secret"
} > .env
printf '%s\n' "$admin_secret" > .runtime/admin-password
chmod 600 .env .runtime/admin-password
printf '%s\n' '{"result":"runtime-secrets-created","files":[".env",".runtime/admin-password"]}'
