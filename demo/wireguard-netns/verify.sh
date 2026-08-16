#!/bin/sh
set -eu
test "$(id -u)" -eq 0 || { echo 'Run as WSL root.' >&2; exit 1; }

ip netns exec aiops-las-workload ping -c 2 -W 2 10.20.0.20 >/dev/null
ip netns exec aiops-chi-workload ping -c 2 -W 2 10.10.0.20 >/dev/null
if ip netns exec aiops-las-workload ping -c 1 -W 1 10.20.0.30 >/dev/null 2>&1; then
  echo '{"result":"failed","check":"denied-east-west"}'
  exit 1
fi
for router in aiops-las-router aiops-chi-router; do
  handshake=$(ip netns exec "$router" wg show wg0 latest-handshakes | cut -f2)
  test "${handshake:-0}" -gt 0
  ip netns exec "$router" nft list table inet aiops_filter | grep -q 'policy drop'
done
las_packets=$(ip netns exec aiops-las-router nft list table inet aiops_filter | awk '/iifname "las-lan"/{for(i=1;i<=NF;i++)if($i=="packets")print $(i+1)}')
chi_packets=$(ip netns exec aiops-chi-router nft list table inet aiops_filter | awk '/iifname "wg0"/{for(i=1;i<=NF;i++)if($i=="packets")print $(i+1)}')
test "${las_packets:-0}" -gt 0
test "${chi_packets:-0}" -gt 0
printf '{"result":"passed","decisionTraceId":"dtr_wireguard_netns_v1","allowed":"10.10.0.20 <-> 10.20.0.20","denied":"10.10.0.20 -> 10.20.0.30","lasForwardPackets":%s,"chiForwardPackets":%s,"boundary":"native WSL namespace routing; not Proxmox or physical HA"}\n' "$las_packets" "$chi_packets"
