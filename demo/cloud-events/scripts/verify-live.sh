#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; issuer='http://127.0.0.1:8081/realms/enterprise-mcp-kit'; api='http://127.0.0.1:8790'; worker='http://127.0.0.1:8791'; started="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
"$root/scripts/ensure-identity.sh"
token_for() { curl -fsS -X POST "$issuer/protocol/openid-connect/token" -d grant_type=password -d client_id=enterprise-mcp-kit -d "username=$1" -d password=local-demo-only | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).access_token))'; }
token="$(token_for cloud-ingestor)"; denied="$(token_for northstar-planner)"; event_id="$(cat /proc/sys/kernel/random/uuid)"; key="cloud-live-$(date +%s)"
body="{\"version\":1,\"eventId\":\"$event_id\",\"tenantId\":\"open-enterprise-aiops\",\"siteId\":\"local-k3s-reference\",\"source\":\"local-k3s\",\"type\":\"cloud.queue.backlog\",\"severity\":\"warning\",\"observedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\",\"correlationId\":\"corr-live-$key\",\"decisionTraceId\":\"dtr-live-$key\",\"subject\":\"orders-worker\",\"evidence\":[{\"sourceRef\":\"prometheus:cloud_queue_depth\",\"summary\":\"Synthetic portfolio proof exceeded the bounded demonstration threshold.\",\"observedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%S.000Z)\"}]}"
status="$(curl -sS -o /tmp/cloud-event-denied.json -w '%{http_code}' -X POST "$api/api/v1/cloud-events" -H "Authorization: Bearer $denied" -H "Idempotency-Key: $key-denied" -H 'content-type: application/json' --data "$body")"; [[ "$status" == 403 ]] || { echo "Expected unauthorized role denial, got $status." >&2; exit 1; }
first="$(curl -fsS -X POST "$api/api/v1/cloud-events" -H "Authorization: Bearer $token" -H "Idempotency-Key: $key" -H 'content-type: application/json' --data "$body")"; replay="$(curl -fsS -X POST "$api/api/v1/cloud-events" -H "Authorization: Bearer $token" -H "Idempotency-Key: $key" -H 'content-type: application/json' --data "$body")"
printf '%s\n%s' "$first" "$replay" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const [a,b]=s.split("\n").map(JSON.parse);if(a.data?.status!=="queued"||a.meta?.replayed!==false||b.meta?.replayed!==true)process.exit(1)})'
docker restart enterprise-aiops-cloud-events-api-1 >/dev/null
sleep 2
for _ in $(seq 1 30); do curl -fsS "$api/readyz" >/dev/null 2>&1 && break; sleep 1; done
restart_replay="$(curl -fsS -X POST "$api/api/v1/cloud-events" -H "Authorization: Bearer $token" -H "Idempotency-Key: $key" -H 'content-type: application/json' --data "$body")"
printf '%s\n%s' "$first" "$restart_replay" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const [a,b]=s.split("\n").map(JSON.parse);if(b.meta?.replayed!==true||a.data?.eventId!==b.data?.eventId||a.data?.acceptedAt!==b.data?.acceptedAt)process.exit(1)})'
conflict_body="${body/\"severity\":\"warning\"/\"severity\":\"critical\"}"
status="$(curl -sS -o /tmp/cloud-event-conflict.json -w '%{http_code}' -X POST "$api/api/v1/cloud-events" -H "Authorization: Bearer $token" -H "Idempotency-Key: $key" -H 'content-type: application/json' --data "$conflict_body")"; [[ "$status" == 409 ]] || { echo "Expected durable idempotency conflict after restart, got $status." >&2; exit 1; }
for _ in $(seq 1 20); do docker logs enterprise-aiops-cloud-events-worker-1 2>&1 | grep -q "$event_id" && break; sleep 1; done
count="$(docker logs --since "$started" enterprise-aiops-cloud-events-worker-1 2>&1 | grep -c "$event_id" || true)"; [[ "$count" == 1 ]] || { echo "Expected one worker evidence record, observed $count." >&2; exit 1; }
for _ in $(seq 1 10); do messages="$(curl -fsS 'http://127.0.0.1:8222/jsz?streams=true' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const stream=j.account_details?.[0]?.stream_detail?.find(v=>v.name==="AIOPS_CLOUD_EVENTS");process.stdout.write(String(stream?.state?.messages??0))})')"; [[ "$messages" == 0 ]] && break; sleep 1; done
[[ "$messages" == 0 ]] || { echo "Expected an empty acknowledged stream, observed $messages messages." >&2; exit 1; }
curl -fsS "$api/readyz" >/dev/null; curl -fsS "$worker/readyz" >/dev/null; curl -fsS "$api/metrics" | grep -q 'outcome="accepted"'; curl -fsS "$worker/metrics" | grep -q 'outcome="processed"'
echo "cloud-event-live-proof=passed event_id=$event_id"
