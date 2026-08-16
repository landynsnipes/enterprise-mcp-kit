#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"; compose=(docker compose --project-name enterprise-aiops-cloud-events --env-file "$root/.env" -f "$root/compose.yaml")
nats='enterprise-aiops-cloud-events-nats-1'; worker='enterprise-aiops-cloud-events-worker-1'; before="$(docker inspect -f '{{.Id}}' "$worker")"; stopped=false
cleanup() { if [[ "$stopped" == true ]]; then docker start "$nats" >/dev/null || true; fi; }
trap cleanup EXIT
docker stop --time 10 "$nats" >/dev/null; stopped=true
api_status=0; worker_status=0
for _ in $(seq 1 15); do api_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8790/readyz || true)"; worker_status="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8791/metrics || true)"; [[ "$api_status" == 503 && "$worker_status" == 503 ]] && break; sleep 1; done
[[ "$api_status" == 503 && "$worker_status" == 503 ]] || { echo "Expected dependency-loss 503 signals, got api=$api_status worker=$worker_status." >&2; exit 1; }
[[ "$(docker inspect -f '{{.State.Running}}' "$worker")" == true ]] || { echo 'Worker stopped during broker loss.' >&2; exit 1; }
docker start "$nats" >/dev/null; stopped=false
for _ in $(seq 1 25); do curl -fsS http://127.0.0.1:8790/readyz >/dev/null 2>&1 && curl -fsS http://127.0.0.1:8791/readyz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8790/readyz >/dev/null; curl -fsS http://127.0.0.1:8791/readyz >/dev/null
[[ "$(docker inspect -f '{{.Id}}' "$worker")" == "$before" ]] || { echo 'Worker container was replaced during broker recovery.' >&2; exit 1; }
"$root/scripts/verify-live.sh"
echo 'cloud-event-broker-recovery=passed'
