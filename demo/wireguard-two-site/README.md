# Two-site WireGuard container simulation

This disposable lab proves the LAS/CHI encrypted link, cryptographic route
allowlists, router-to-router heartbeat, default-deny forwarding policy,
negative testing, and teardown workflow without claiming routed site-LAN
forwarding, Proxmox VM lifecycle, or physical high availability.

The routers receive only `NET_ADMIN`; all other capabilities are dropped. The
site and transit networks are Docker-internal. Containers are read-only with
`no-new-privileges`. Private keys are generated under ignored `.runtime/` files
with mode `0640` and are never written to NetBox or rendered inventory. Router
processes receive the local private key-owner group (`1001` by default) as a
supplemental group; override `AIOPS_RUNTIME_GID` under another account.
The simulation includes a narrowly scoped source-NAT rule for future forwarded
`wg0` traffic, but Docker Desktop's host bridge firewall prevents this lab from
claiming site-LAN forwarding evidence. A future VM deployment preserves routed
source addresses and removes this simulation-only rule.

Run, in order:

```sh
npm run aiops:wireguard:sim:keys
npm run aiops:wireguard:sim:up
npm run aiops:wireguard:sim:verify
npm run aiops:wireguard:sim:down
```

`down` removes the disposable containers and networks but preserves ignored
keys for evidence and repeatability. Delete `.runtime/` separately only when
intentional key destruction is approved.
The `up` command recreates routers and probes together so Docker MAC changes
cannot leave stale neighbor entries pointing at a previous router container.
