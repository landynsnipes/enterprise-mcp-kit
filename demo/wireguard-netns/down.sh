#!/bin/sh
set -eu
test "$(id -u)" -eq 0 || { echo 'Run as WSL root.' >&2; exit 1; }
for namespace in aiops-las-router aiops-chi-router aiops-las-workload aiops-chi-workload aiops-chi-denied; do
  ip netns delete "$namespace" 2>/dev/null || true
done
printf '%s\n' '{"result":"removed","scope":"five aiops network namespaces","keysPreserved":true}'
