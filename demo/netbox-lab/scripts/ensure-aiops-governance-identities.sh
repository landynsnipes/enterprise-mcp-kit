#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
env_file="$root/.env"
[[ -f "$env_file" ]] || { echo 'Missing local lab environment. Run npm run demo:env first.' >&2; exit 1; }
set -a; source "$env_file"; set +a
issuer='http://127.0.0.1:8081'
admin_token="$(curl -fsS -X POST "$issuer/realms/master/protocol/openid-connect/token" -d grant_type=password -d "client_id=admin-cli" -d "username=$KEYCLOAK_ADMIN" -d "password=$KEYCLOAK_ADMIN_PASSWORD" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(typeof x.access_token!=="string")process.exit(1);process.stdout.write(x.access_token)})')"
auth=(-H "Authorization: Bearer $admin_token" -H 'content-type: application/json')
realm="$issuer/admin/realms/enterprise-mcp-kit"
for role in planner approver executor; do curl -fsS "$realm/roles/$role" "${auth[@]}" >/dev/null; done
client_id="$(curl -fsS "$realm/clients?clientId=enterprise-mcp-kit" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s)[0]?.id??""))')"
scope_id="$(curl -fsS "$realm/client-scopes?name=governance-claims" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s)[0]?.id??""))')"
[[ -n "$client_id" && -n "$scope_id" ]] || { echo 'The governance-claims client scope is unavailable.' >&2; exit 1; }
curl -fsS -X PUT "$realm/clients/$client_id/default-client-scopes/$scope_id" "${auth[@]}" >/dev/null
profile="$(curl -fsS "$realm/users/profile" "${auth[@]}")"
profile="$(printf '%s' "$profile" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);x.attributes??=[];if(!x.attributes.some(a=>a.name==="tenant_id"))x.attributes.push({name:"tenant_id",displayName:"Tenant ID",permissions:{view:["admin"],edit:["admin"]},multivalued:false});process.stdout.write(JSON.stringify(x))})')"
curl -fsS -X PUT "$realm/users/profile" "${auth[@]}" --data "$profile" >/dev/null
for spec in 'aiops-planner:planner' 'aiops-approver:approver' 'aiops-executor:executor'; do
  username="${spec%%:*}"; role="${spec##*:}"
  users="$(curl -fsS "$realm/users?username=$username&exact=true" "${auth[@]}")"
  user_id="$(printf '%s' "$users" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);process.stdout.write(x[0]?.id??"")})')"
  body="{\"username\":\"$username\",\"enabled\":true,\"attributes\":{\"tenant_id\":[\"open-enterprise-aiops\"]}}"
  if [[ -z "$user_id" ]]; then curl -fsS -X POST "$realm/users" "${auth[@]}" --data "$body" >/dev/null; user_id="$(curl -fsS "$realm/users?username=$username&exact=true" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s)[0].id))')"; else curl -fsS -X PUT "$realm/users/$user_id" "${auth[@]}" --data "$body" >/dev/null; fi
  tenant_check="$(curl -fsS "$realm/users/$user_id" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);process.stdout.write(x.attributes?.tenant_id?.[0]??"")})')"
  if [[ "$tenant_check" != 'open-enterprise-aiops' ]]; then
    curl -fsS -X DELETE "$realm/users/$user_id" "${auth[@]}" >/dev/null
    curl -fsS -X POST "$realm/users" "${auth[@]}" --data "$body" >/dev/null
    user_id="$(curl -fsS "$realm/users?username=$username&exact=true" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s)[0].id))')"
    tenant_check="$(curl -fsS "$realm/users/$user_id" "${auth[@]}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).attributes?.tenant_id?.[0]??""))')"
  fi
  [[ "$tenant_check" == 'open-enterprise-aiops' ]] || { echo "Keycloak did not persist the tenant scope for $username." >&2; exit 1; }
  curl -fsS -X PUT "$realm/users/$user_id/reset-password" "${auth[@]}" --data '{"type":"password","value":"local-demo-only","temporary":false}' >/dev/null
  role_json="$(curl -fsS "$realm/roles/$role" "${auth[@]}")"
  curl -fsS -X POST "$realm/users/$user_id/role-mappings/realm" "${auth[@]}" --data "[$role_json]" >/dev/null
done
echo 'Tenant-scoped AIOps planner, approver, and executor identities are ready.'
