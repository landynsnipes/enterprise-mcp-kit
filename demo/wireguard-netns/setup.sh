#!/bin/sh
set -eu

test "$(id -u)" -eq 0 || { echo 'Run as WSL root.' >&2; exit 1; }
cd "$(dirname "$0")"
key_dir=../wireguard-two-site/.runtime
for key in las-private.key las-public.key chi-private.key chi-public.key; do
  test -s "$key_dir/$key" || { echo "Missing ignored key file: $key_dir/$key" >&2; exit 1; }
done

namespaces='aiops-las-router aiops-chi-router aiops-las-workload aiops-chi-workload aiops-chi-denied'
for namespace in $namespaces; do ip netns delete "$namespace" 2>/dev/null || true; done
cleanup(){ for namespace in $namespaces; do ip netns delete "$namespace" 2>/dev/null || true; done; }
trap cleanup INT TERM HUP
for namespace in $namespaces; do ip netns add "$namespace"; ip -n "$namespace" link set lo up; done

# Dedicated simulated WAN.
ip link add las-wan type veth peer name chi-wan
ip link set las-wan netns aiops-las-router
ip link set chi-wan netns aiops-chi-router
ip -n aiops-las-router address add 172.30.0.2/29 dev las-wan
ip -n aiops-chi-router address add 172.30.0.3/29 dev chi-wan
ip -n aiops-las-router link set las-wan up
ip -n aiops-chi-router link set chi-wan up

# LAS site workload link.
ip link add las-lan type veth peer name las-app
ip link set las-lan netns aiops-las-router
ip link set las-app netns aiops-las-workload
ip -n aiops-las-router address add 10.10.0.10/24 dev las-lan
ip -n aiops-las-workload address add 10.10.0.20/24 dev las-app
ip -n aiops-las-router link set las-lan up
ip -n aiops-las-workload link set las-app up
ip -n aiops-las-workload route add 10.20.0.0/24 via 10.10.0.10

# CHI site bridge with one approved and one denied workload.
ip -n aiops-chi-router link add chi-br0 type bridge
ip -n aiops-chi-router address add 10.20.0.10/24 dev chi-br0
ip -n aiops-chi-router link set chi-br0 up
for endpoint in health denied; do
  if [ "$endpoint" = health ]; then workload_namespace=aiops-chi-workload; else workload_namespace=aiops-chi-denied; fi
  ip link add "chi-$endpoint-r" type veth peer name "chi-$endpoint-w"
  ip link set "chi-$endpoint-r" netns aiops-chi-router
  ip link set "chi-$endpoint-w" netns "$workload_namespace"
  ip -n aiops-chi-router link set "chi-$endpoint-r" master chi-br0
  ip -n aiops-chi-router link set "chi-$endpoint-r" up
  ip -n "$workload_namespace" link set "chi-$endpoint-w" up
done
ip -n aiops-chi-workload address add 10.20.0.20/24 dev chi-health-w
ip -n aiops-chi-denied address add 10.20.0.30/24 dev chi-denied-w
ip -n aiops-chi-workload route add 10.10.0.0/24 via 10.20.0.10
ip -n aiops-chi-denied route add 10.10.0.0/24 via 10.20.0.10

for router in aiops-las-router aiops-chi-router; do ip netns exec "$router" sysctl -q -w net.ipv4.ip_forward=1; done

ip -n aiops-las-router link add wg0 type wireguard
ip -n aiops-chi-router link add wg0 type wireguard
ip -n aiops-las-router address add 10.255.0.1/30 dev wg0
ip -n aiops-chi-router address add 10.255.0.2/30 dev wg0
ip netns exec aiops-las-router wg set wg0 private-key "$key_dir/las-private.key" listen-port 51820 peer "$(cat "$key_dir/chi-public.key")" endpoint 172.30.0.3:51820 allowed-ips 10.20.0.20/32,10.255.0.2/32 persistent-keepalive 5
ip netns exec aiops-chi-router wg set wg0 private-key "$key_dir/chi-private.key" listen-port 51820 peer "$(cat "$key_dir/las-public.key")" endpoint 172.30.0.2:51820 allowed-ips 10.10.0.20/32,10.255.0.1/32 persistent-keepalive 5
ip -n aiops-las-router link set wg0 up
ip -n aiops-chi-router link set wg0 up
ip -n aiops-las-router route add 10.20.0.20/32 dev wg0
ip -n aiops-chi-router route add 10.10.0.20/32 dev wg0

ip netns exec aiops-las-router nft -f - <<'EOF'
table inet aiops_filter {
  chain forward { type filter hook forward priority 0; policy drop;
    ct state invalid counter drop
    ct state established,related counter accept
    iifname "las-lan" oifname "wg0" ip saddr 10.10.0.20 ip daddr 10.20.0.20 counter accept
    iifname "wg0" oifname "las-lan" ip saddr 10.20.0.20 ip daddr 10.10.0.20 counter accept
  }
}
EOF
ip netns exec aiops-chi-router nft -f - <<'EOF'
table inet aiops_filter {
  chain forward { type filter hook forward priority 0; policy drop;
    ct state invalid counter drop
    ct state established,related counter accept
    iifname "chi-br0" oifname "wg0" ip saddr 10.20.0.20 ip daddr 10.10.0.20 counter accept
    iifname "wg0" oifname "chi-br0" ip saddr 10.10.0.20 ip daddr 10.20.0.20 counter accept
  }
}
EOF

trap - INT TERM HUP
printf '%s\n' '{"result":"started","decisionTraceId":"dtr_wireguard_netns_v1","namespaces":5,"boundary":"native WSL network namespaces; not Proxmox or physical HA"}'
