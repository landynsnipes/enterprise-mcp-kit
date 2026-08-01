#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; repo="$(cd "$root/../.." && pwd)"
issuer='http://127.0.0.1:8081/realms/enterprise-mcp-kit'; workdir="$(mktemp -d)"; gateway_pid=''
cleanup() { [[ -z "$gateway_pid" ]] || kill "$gateway_pid" >/dev/null 2>&1 || true; rm -rf "$workdir"; }
trap cleanup EXIT
[[ -f "$root/.mcp.env" && -f "$root/.governance-write.env" ]] || { echo 'Missing local credentials. Run npm run demo:seed first.' >&2; exit 1; }
set -a; source "$root/.mcp.env"; source "$root/.governance-write.env"; set +a
if curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null; then echo 'Port 8787 is already in use.' >&2; exit 1; fi
target="$(curl -fsS "$NETBOX_BASE_URL/api/dcim/devices/?name=ns-phx-edge-01" -H "Authorization: Bearer $NETBOX_TOKEN")"
device_id="$(printf %s "$target" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).results;if(r?.length!==1||r[0].tenant?.slug!=="northstar-financial"||r[0].custom_fields?.observed_software_version!=="12.4.3")process.exit(1);process.stdout.write(String(r[0].id))})')"
last_updated="$(printf %s "$target" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).results[0].last_updated))')"
npm run build --prefix "$repo" >/dev/null
GOVERNANCE_OIDC_ISSUER="$issuer" GOVERNANCE_OIDC_JWKS_URL="$issuer/protocol/openid-connect/certs" GOVERNANCE_OIDC_AUDIENCE=enterprise-mcp-kit GOVERNANCE_STORAGE_PATH="$workdir/governance.json" GOVERNANCE_ALLOW_INSECURE_LOOPBACK_OIDC=true GOVERNANCE_EXECUTION_ENABLED=true GOVERNANCE_ALLOW_INSECURE_LOOPBACK_WRITE=true NETBOX_WRITE_BASE_URL="$NETBOX_WRITE_BASE_URL" NETBOX_WRITE_TOKEN="$NETBOX_WRITE_TOKEN" GOVERNANCE_HTTP_PORT=8787 node "$repo/dist/src/governance-http-server.js" >"$workdir/gateway.log" 2>&1 &
gateway_pid=$!
for _ in $(seq 1 30); do curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null && break; sleep 1; done
kill -0 "$gateway_pid" 2>/dev/null || { echo 'Governance gateway failed to start.' >&2; exit 1; }
token() { curl -fsS -X POST "$issuer/protocol/openid-connect/token" -d grant_type=password -d client_id=enterprise-mcp-kit -d "username=$1" -d password=local-demo-only | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))'; }
planner="$(token northstar-planner)"; approver="$(token northstar-approver)"; executor="$(token northstar-executor)"; expires="$(node -e 'console.log(new Date(Date.now()+600000).toISOString())')"
payload="$(DEVICE_ID="$device_id" LAST_UPDATED="$last_updated" EXPIRES="$expires" node -e 'process.stdout.write(JSON.stringify({actionType:"netbox.device.software-version.update",target:{kind:"netbox-device",id:process.env.DEVICE_ID},proposedChange:"Record observed software version 12.4.4.",confidence:1,evidence:[{source:`api/dcim/devices/${process.env.DEVICE_ID}/`,summary:"NetBox records observed version 12.4.3 at the captured version."}],ruleVersion:"bounded-software-version-v1",promptVersion:null,expiresAt:process.env.EXPIRES,operation:{field:"observed_software_version",expectedValue:"12.4.3",newValue:"12.4.4",expectedLastUpdated:process.env.LAST_UPDATED}}))')"
plan="$(curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/create_action_plan -H "Authorization: Bearer $planner" -H 'Idempotency-Key: write-create-0001' -H 'content-type: application/json' --data "$payload")"
id="$(printf %s "$plan" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).data.id))')"
curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/approve_action_plan -H "Authorization: Bearer $approver" -H 'Idempotency-Key: write-approve-0001' -H 'content-type: application/json' --data "{\"planId\":\"$id\",\"reason\":\"Exact field, value, target, and captured version reviewed.\"}" >/dev/null
for actor in "$planner" "$approver"; do status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8787/api/v1/governance/tools/execute_action_plan -H "Authorization: Bearer $actor" -H "Idempotency-Key: denied-$RANDOM-0001" -H 'content-type: application/json' --data "{\"planId\":\"$id\"}")"; [[ "$status" == 401 ]] || { echo "Expected execute denial, got HTTP $status." >&2; exit 1; }; done
executed="$(curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/execute_action_plan -H "Authorization: Bearer $executor" -H 'Idempotency-Key: write-execute-0001' -H 'content-type: application/json' --data "{\"planId\":\"$id\"}")"
replay="$(curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/execute_action_plan -H "Authorization: Bearer $executor" -H 'Idempotency-Key: write-execute-0001' -H 'content-type: application/json' --data "{\"planId\":\"$id\"}")"
printf '%s\n%s' "$executed" "$replay" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const [a,b]=s.split("\n").map(JSON.parse);if(a.data?.state!=="executed"||a.data?.execution?.afterValue!=="12.4.4"||a.meta?.execution!=="enabled"||b.meta?.replayed!==true)process.exit(1)})'
rolled_back="$(curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/rollback_action_plan -H "Authorization: Bearer $executor" -H 'Idempotency-Key: write-rollback-0001' -H 'content-type: application/json' --data "{\"planId\":\"$id\"}")"
printf %s "$rolled_back" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);if(a.data?.state!=="rolled_back"||a.data?.rollback?.afterValue!=="12.4.3")process.exit(1);console.log(JSON.stringify({bounded_software_version_write:"passed",state:a.data.state,restored:a.data.rollback.afterValue,actual_device_runtime_claim:false}))})'
