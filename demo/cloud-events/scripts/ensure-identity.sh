#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"; env_file="$root/netbox-lab/.env"; issuer='http://127.0.0.1:8081'
[[ -f "$env_file" ]] || { echo 'NetBox lab environment is missing.' >&2; exit 1; }
admin="$(sed -n 's/^KEYCLOAK_ADMIN=//p' "$env_file")"; password="$(sed -n 's/^KEYCLOAK_ADMIN_PASSWORD=//p' "$env_file")"
token="$(curl -fsS -X POST "$issuer/realms/master/protocol/openid-connect/token" -d grant_type=password -d client_id=admin-cli -d "username=$admin" -d "password=$password" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))')"
auth=(-H "Authorization: Bearer $token" -H 'content-type: application/json')
curl -fsS "$issuer/admin/realms/enterprise-mcp-kit/roles/cloud-event-ingestor" "${auth[@]}" >/dev/null 2>&1 || curl -fsS -X POST "$issuer/admin/realms/enterprise-mcp-kit/roles" "${auth[@]}" --data '{"name":"cloud-event-ingestor"}' >/dev/null
users="$(curl -fsS "$issuer/admin/realms/enterprise-mcp-kit/users?username=cloud-ingestor&exact=true" "${auth[@]}")"
user_id="$(printf %s "$users" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const u=JSON.parse(s)[0];if(u)process.stdout.write(u.id)})')"
if [[ -z "$user_id" ]]; then curl -fsS -X POST "$issuer/admin/realms/enterprise-mcp-kit/users" "${auth[@]}" --data '{"username":"cloud-ingestor","enabled":true,"attributes":{"tenant_id":["open-enterprise-aiops"]}}' >/dev/null; user_id="$(curl -fsS "$issuer/admin/realms/enterprise-mcp-kit/users?username=cloud-ingestor&exact=true" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s)[0].id))')"; fi
curl -fsS -X PUT "$issuer/admin/realms/enterprise-mcp-kit/users/$user_id" "${auth[@]}" --data '{"username":"cloud-ingestor","enabled":true,"attributes":{"tenant_id":["open-enterprise-aiops"]}}' >/dev/null
curl -fsS -X PUT "$issuer/admin/realms/enterprise-mcp-kit/users/$user_id/reset-password" "${auth[@]}" --data '{"type":"password","value":"local-demo-only","temporary":false}' >/dev/null
role="$(curl -fsS "$issuer/admin/realms/enterprise-mcp-kit/roles/cloud-event-ingestor" "${auth[@]}")"; curl -fsS -X POST "$issuer/admin/realms/enterprise-mcp-kit/users/$user_id/role-mappings/realm" "${auth[@]}" --data "[$role]" >/dev/null
echo 'cloud-event-keycloak-identity=ready'
