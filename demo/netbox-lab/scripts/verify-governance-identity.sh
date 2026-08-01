#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
issuer='http://127.0.0.1:8081/realms/enterprise-mcp-kit'
workdir="$(mktemp -d)"; gateway_pid=''
cleanup() { [[ -z "$gateway_pid" ]] || kill "$gateway_pid" >/dev/null 2>&1 || true; rm -rf "$workdir"; }
trap cleanup EXIT
if curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null; then echo 'Port 8787 is already in use; refusing to interfere with another gateway.' >&2; exit 1; fi
npm run build --prefix "$repo" >/dev/null
GOVERNANCE_OIDC_ISSUER="$issuer" GOVERNANCE_OIDC_JWKS_URL="$issuer/protocol/openid-connect/certs" GOVERNANCE_OIDC_AUDIENCE=enterprise-mcp-kit GOVERNANCE_STORAGE_PATH="$workdir/governance.json" GOVERNANCE_ALLOW_INSECURE_LOOPBACK_OIDC=true GOVERNANCE_HTTP_PORT=8787 node "$repo/dist/src/governance-http-server.js" >"$workdir/gateway.log" 2>&1 &
gateway_pid=$!
for _ in $(seq 1 30); do curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null && break; sleep 1; done
kill -0 "$gateway_pid" 2>/dev/null || { echo 'Governance gateway failed to start.' >&2; exit 1; }
token() { curl -fsS -X POST "$issuer/protocol/openid-connect/token" -d grant_type=password -d client_id=enterprise-mcp-kit -d "username=$1" -d password=local-demo-only | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))'; }
planner="$(token northstar-planner)"; approver="$(token northstar-approver)"; summit_approver="$(token summit-approver)"
expires="$(node -e 'console.log(new Date(Date.now()+600000).toISOString())')"
plan="$(curl -sS -X POST http://127.0.0.1:8787/api/v1/governance/tools/create_action_plan -H "Authorization: Bearer $planner" -H 'Idempotency-Key: live-create-0001' -H 'content-type: application/json' --data "{\"actionType\":\"netbox.device.update\",\"target\":{\"kind\":\"netbox-device\",\"id\":\"7\"},\"proposedChange\":\"Change role.\",\"confidence\":0.8,\"evidence\":[{\"source\":\"api/dcim/devices/7/\",\"summary\":\"Local lab evidence.\"}],\"ruleVersion\":\"lab-v1\",\"promptVersion\":null,\"expiresAt\":\"$expires\"}")"
id="$(printf %s "$plan" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);if(typeof d.data?.id!=="string"){console.error(`Create plan failed: ${d.error_code ?? "unknown error"}: ${d.message ?? "no detail"}`);process.exit(1)}process.stdout.write(d.data.id)})')"
for actor in "$planner" "$summit_approver"; do
  status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8787/api/v1/governance/tools/approve_action_plan -H "Authorization: Bearer $actor" -H "Idempotency-Key: denied-$RANDOM-0001" -H 'content-type: application/json' --data "{\"planId\":\"$id\",\"reason\":\"Must be denied.\"}")"
  [[ "$status" == 401 ]] || { echo "Expected authorization denial, got HTTP $status." >&2; exit 1; }
done
approval="$(curl -sS -X POST http://127.0.0.1:8787/api/v1/governance/tools/approve_action_plan -H "Authorization: Bearer $approver" -H 'Idempotency-Key: live-approve-0001' -H 'content-type: application/json' --data "{\"planId\":\"$id\",\"reason\":\"Approved in local identity lab.\"}")"
replay="$(curl -sS -X POST http://127.0.0.1:8787/api/v1/governance/tools/approve_action_plan -H "Authorization: Bearer $approver" -H 'Idempotency-Key: live-approve-0001' -H 'content-type: application/json' --data "{\"planId\":\"$id\",\"reason\":\"Approved in local identity lab.\"}")"
printf '%s\n%s' "$approval" "$replay" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const [a,r]=s.split("\n").map(JSON.parse);if(a.data?.state!=="approved"||a.data?.tenantId!=="northstar-financial"||a.meta?.execution!=="disabled"||a.meta?.replayed!==false||r.data?.id!==a.data?.id||r.meta?.replayed!==true){console.error("Approval or replay proof failed.");process.exit(1)}console.log("governance-keycloak-prewrite-gate=passed")})'
