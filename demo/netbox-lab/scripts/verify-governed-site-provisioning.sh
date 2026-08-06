#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; repo="$(cd "$root/../.." && pwd)"
issuer='http://127.0.0.1:8081/realms/enterprise-mcp-kit'; workdir="$(mktemp -d)"; gateway_pid=''
cleanup(){ [[ -z "$gateway_pid" ]] || kill "$gateway_pid" >/dev/null 2>&1 || true; rm -rf "$workdir"; }
trap cleanup EXIT
[[ -f "$root/.governance-provision.env" ]] || { echo 'Missing provisioning credential. Run npm run demo:seed first.' >&2; exit 1; }
set -a; source "$root/.governance-provision.env"; set +a
if curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null; then echo 'Port 8787 is already in use.' >&2; exit 1; fi
npm run build --prefix "$repo" >/dev/null
GOVERNANCE_OIDC_ISSUER="$issuer" GOVERNANCE_OIDC_JWKS_URL="$issuer/protocol/openid-connect/certs" GOVERNANCE_OIDC_AUDIENCE=enterprise-mcp-kit GOVERNANCE_STORAGE_PATH="$workdir/governance.json" GOVERNANCE_ALLOW_INSECURE_LOOPBACK_OIDC=true GOVERNANCE_PROVISIONING_ENABLED=true GOVERNANCE_ALLOW_INSECURE_LOOPBACK_WRITE=true NETBOX_PROVISION_BASE_URL="$NETBOX_PROVISION_BASE_URL" NETBOX_PROVISION_TOKEN="$NETBOX_PROVISION_TOKEN" NETBOX_PROVISION_TIMEOUT_MS="$NETBOX_PROVISION_TIMEOUT_MS" GOVERNANCE_HTTP_PORT=8787 node "$repo/dist/src/governance-http-server.js" >"$workdir/gateway.log" 2>&1 &
gateway_pid=$!
for _ in $(seq 1 30);do curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null&&break;sleep 1;done
kill -0 "$gateway_pid" 2>/dev/null||{ cat "$workdir/gateway.log" >&2;exit 1; }
token(){ curl -fsS -X POST "$issuer/protocol/openid-connect/token" -d grant_type=password -d client_id=enterprise-mcp-kit -d "username=$1" -d password=local-demo-only|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))'; }
planner="$(token northstar-planner)";approver="$(token northstar-approver)";executor="$(token northstar-executor)";expires="$(node -e 'console.log(new Date(Date.now()+600000).toISOString())')"
payload="$(EXPIRES="$expires" node -e 'process.stdout.write(JSON.stringify({manifest:{version:1,tenantSlug:"northstar-financial",site:{name:"Northstar Tucson Governed Verification",slug:"northstar-tucson-governed-verification",facility:"TUS-GOV",physicalAddress:"Sanitized governed verification site, Tucson, AZ",timeZone:"America/Phoenix"},racks:[{name:"TUS-G01",uHeight:42}],devices:[{name:"ns-tus-governed-edge-01",rackName:"TUS-G01",position:42,face:"front",deviceTypeSlug:"edge-router-1000",roleSlug:"edge-router",platformSlug:null,interfaces:[{name:"ge-0/0/0",address:"198.51.100.253/32"}]}]},proposedChange:"Create the exact reviewed Tucson site manifest.",confidence:1,expiresAt:process.env.EXPIRES}))')"
planned="$(curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/plan_customer_site_provisioning -H "Authorization: Bearer $planner" -H 'Idempotency-Key: provision-plan-live-001' -H 'content-type: application/json' --data "$payload")"
id="$(printf %s "$planned"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(x.data?.state!=="planned"||x.data?.provisioning?.manifestDigest?.length!==64)process.exit(1);process.stdout.write(x.data.id)})')"
curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/approve_action_plan -H "Authorization: Bearer $approver" -H 'Idempotency-Key: provision-approve-live-001' -H 'content-type: application/json' --data "{\"planId\":\"$id\",\"reason\":\"Manifest digest, tenant, and ordered resources reviewed.\"}" >/dev/null
for actor in "$planner" "$approver";do status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8787/api/v1/governance/tools/execute_action_plan -H "Authorization: Bearer $actor" -H "Idempotency-Key: provision-denied-$RANDOM" -H 'content-type: application/json' --data "{\"planId\":\"$id\"}")";[[ "$status" == 401 ]]||{ echo "Expected separation-of-duties denial, got $status." >&2;exit 1;};done
executed="$(curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/execute_action_plan -H "Authorization: Bearer $executor" -H 'Idempotency-Key: provision-execute-live-001' -H 'content-type: application/json' --data "{\"planId\":\"$id\"}")"
printf %s "$executed"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(x.data?.state!=="executed"||x.data?.execution?.created?.length!==5)process.exit(1)})'
rolled="$(curl -fsS -X POST http://127.0.0.1:8787/api/v1/governance/tools/rollback_action_plan -H "Authorization: Bearer $executor" -H 'Idempotency-Key: provision-rollback-live-001' -H 'content-type: application/json' --data "{\"planId\":\"$id\"}")"
printf %s "$rolled"|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(x.data?.state!=="rolled_back"||x.data?.rollback?.compensated?.length!==5)process.exit(1);console.log(JSON.stringify({governed_customer_site_provisioning:"passed",state:x.data.state,created:x.data.execution.created.map(r=>r.kind),rollback:x.data.rollback.compensated.map(r=>r.kind),live_state_claim:false}))})'
