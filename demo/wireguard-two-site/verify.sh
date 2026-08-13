#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

docker compose exec -T las-router ping -c 2 -W 2 10.255.0.2 >/dev/null
docker compose exec -T chi-router ping -c 2 -W 2 10.255.0.1 >/dev/null
if docker compose exec -T las-router ping -c 1 -W 1 10.20.0.30 >/dev/null 2>&1; then
  printf '%s\n' '{"result":"failed","check":"restricted-east-west"}'
  exit 1
fi

for router in las-router chi-router; do
  handshake=$(docker compose exec -T "$router" wg show wg0 latest-handshakes | awk '{print $2}')
  test "${handshake:-0}" -gt 0
  docker compose exec -T "$router" nft list table inet aiops_filter | grep -q 'policy drop'
done

printf '%s\n' '{"result":"passed","decisionTraceId":"dtr_wireguard_sim_v1","allowed":"LAS wg0 <-> CHI wg0 heartbeat","denied":"LAS router -> CHI denied host","boundary":"container tunnel simulation; Docker bridge isolation prevents this from proving routed site-LAN forwarding, Proxmox, or physical HA"}'
