#!/bin/sh
set -eu

required='SITE LAN_ADDRESS TRANSIT_ADDRESS WG_ADDRESS PEER_ENDPOINT ALLOWED_PREFIX ALLOWED_PREFIXES DECISION_TRACE_ID'
for name in $required; do
  eval "value=\${$name:-}"
  test -n "$value" || { printf '{"level":"error","event":"configuration_rejected","field":"%s"}\n' "$name"; exit 1; }
done

test -s /run/secrets/private_key
test -s /run/secrets/peer_public_key
lan_interface=$(ip -o -4 address show | awk -v address="$LAN_ADDRESS" '$4 == address { print $2 }')
transit_interface=$(ip -o -4 address show | awk -v address="$TRANSIT_ADDRESS" '$4 == address { print $2 }')
lan_ip=${LAN_ADDRESS%/*}
test -n "$lan_interface"
test -n "$transit_interface"

ip link add wg0 type wireguard
ip address add "$WG_ADDRESS" dev wg0
wg set wg0 private-key /run/secrets/private_key listen-port 51820 peer "$(cat /run/secrets/peer_public_key)" endpoint "$PEER_ENDPOINT" allowed-ips "$ALLOWED_PREFIXES" persistent-keepalive 5
ip link set wg0 up
old_ifs=$IFS
IFS=,
for prefix in $ALLOWED_PREFIXES; do ip route replace "$prefix" dev wg0; done
IFS=$old_ifs

nft -f - <<EOF
table inet aiops_filter {
  chain forward {
    type filter hook forward priority 0; policy drop;
    ct state invalid counter drop
    ct state established,related counter accept
    iifname "$lan_interface" oifname "wg0" ip daddr $ALLOWED_PREFIX counter accept
    iifname "wg0" oifname "$lan_interface" ip saddr $ALLOWED_PREFIX counter accept
  }
}
table ip aiops_nat {
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    iifname "wg0" oifname "$lan_interface" counter snat to $lan_ip
  }
}
EOF

printf '{"level":"info","event":"router_ready","site":"%s","decision_trace_id":"%s","allowed_prefix":"%s"}\n' "$SITE" "$DECISION_TRACE_ID" "$ALLOWED_PREFIX"
exec tail -f /dev/null
