#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)";repo="$(cd "$root/../.." && pwd)";issuer='http://127.0.0.1:8081/realms/enterprise-mcp-kit';workdir="$(mktemp -d)";gateway_pid=''
cleanup(){ [[ -z "$gateway_pid" ]]||kill "$gateway_pid" >/dev/null 2>&1||true;rm -rf "$workdir"; };trap cleanup EXIT
[[ -f "$root/.governance-provision.env" ]]||{ echo 'Missing provisioning credential. Run npm run demo:seed first.' >&2;exit 1; };set -a;source "$root/.governance-provision.env";set +a
if curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null;then echo 'Port 8787 is already in use.' >&2;exit 1;fi
npm run build --prefix "$repo" >/dev/null
GOVERNANCE_OIDC_ISSUER="$issuer" GOVERNANCE_OIDC_JWKS_URL="$issuer/protocol/openid-connect/certs" GOVERNANCE_OIDC_AUDIENCE=enterprise-mcp-kit GOVERNANCE_STORAGE_PATH="$workdir/governance.json" GOVERNANCE_ALLOW_INSECURE_LOOPBACK_OIDC=true GOVERNANCE_PROVISIONING_ENABLED=true GOVERNANCE_ALLOW_INSECURE_LOOPBACK_WRITE=true GOVERNANCE_MCP_ALLOWED_HOSTS=127.0.0.1:8787 GOVERNANCE_MCP_REQUESTS_PER_MINUTE=60 NETBOX_PROVISION_BASE_URL="$NETBOX_PROVISION_BASE_URL" NETBOX_PROVISION_TOKEN="$NETBOX_PROVISION_TOKEN" NETBOX_PROVISION_TIMEOUT_MS="$NETBOX_PROVISION_TIMEOUT_MS" GOVERNANCE_HTTP_PORT=8787 node "$repo/dist/src/governance-http-server.js" >"$workdir/gateway.log" 2>&1 &gateway_pid=$!
for _ in $(seq 1 30);do curl -sS -o /dev/null http://127.0.0.1:8787/ 2>/dev/null&&break;sleep 1;done;kill -0 "$gateway_pid" 2>/dev/null||{ cat "$workdir/gateway.log" >&2;exit 1; }
curl -fsS http://127.0.0.1:8787/healthz|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const x=JSON.parse(s);if(x.status!=="ready"||x.governance_store!=="file")process.exit(1)})'
token(){ curl -fsS -X POST "$issuer/protocol/openid-connect/token" -d grant_type=password -d client_id=enterprise-mcp-kit -d "username=$1" -d password=local-demo-only|node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))'; }
PLANNER_TOKEN="$(token northstar-planner)" APPROVER_TOKEN="$(token northstar-approver)" EXECUTOR_TOKEN="$(token northstar-executor)" GOVERNANCE_MCP_URL=http://127.0.0.1:8787/mcp node "$root/scripts/verify-governance-mcp.mjs"
curl -fsS http://127.0.0.1:8787/metrics|grep -q 'enterprise_mcp_governance_requests_total{route="mcp"}'
