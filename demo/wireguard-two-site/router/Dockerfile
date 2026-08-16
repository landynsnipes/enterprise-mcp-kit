FROM alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412

RUN apk add --no-cache \
      iproute2=6.15.0-r0 \
      nftables=1.1.3-r0 \
      wireguard-tools=1.0.20250521-r0

COPY entrypoint.sh /usr/local/bin/router-entrypoint
RUN chmod 0555 /usr/local/bin/router-entrypoint

ENTRYPOINT ["/usr/local/bin/router-entrypoint"]
