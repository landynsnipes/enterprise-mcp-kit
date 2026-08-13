#!/bin/sh
set -eu
test "$(id -u)" -eq 0 || { echo 'Run as WSL root.' >&2; exit 1; }
cd "$(dirname "$0")"

sh partition.sh down
if ip netns exec aiops-las-workload ping -c 1 -W 1 10.20.0.20 >/dev/null 2>&1; then
  sh partition.sh up
  echo '{"result":"failed","check":"partition-did-not-degrade-connectivity"}'
  exit 1
fi
echo '{"result":"passed","check":"partition-caused-degraded-operation","decisionTraceId":"dtr_wireguard_netns_v1"}'
sh partition.sh up
sleep 6
sh verify.sh
