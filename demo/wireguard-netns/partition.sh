#!/bin/sh
set -eu
test "$(id -u)" -eq 0 || { echo 'Run as WSL root.' >&2; exit 1; }
case "${1:-}" in
  down) ip -n aiops-las-router link set las-wan down; result=partitioned ;;
  up) ip -n aiops-las-router link set las-wan up; result=recovered ;;
  *) echo 'Usage: partition.sh down|up' >&2; exit 2 ;;
esac
printf '{"result":"%s","decisionTraceId":"dtr_wireguard_netns_v1","link":"LAS simulated WAN"}\n' "$result"
