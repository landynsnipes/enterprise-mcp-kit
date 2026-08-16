# Connect the WireGuard MCP to an existing WireGuard deployment

Choose this path when WireGuard is already your site-to-site or remote-access
overlay. It installs only the MCP integration. It does not configure peers,
generate keys, or replace your tunnels.

Two backends:

| `WIREGUARD_BACKEND` | You supply | Read | Write |
| --- | --- | --- | --- |
| `http` (default) | A status API that implements the interface document below | `get_interface_status`, optional `get_tunnel_health` | `POST /api/interfaces/{name}/restart` when writes are enabled |
| `local` | A Linux host that can run `wg` and `systemctl` | `wg show <iface> dump` for admitted interfaces | `systemctl restart wg-quick@<iface>` |

Private keys and preshared keys are never returned. Public keys are reported as SHA-256 fingerprints on the local backend.

## What users can do

| Tool | Input | Use it for |
| --- | --- | --- |
| `get_interface_status` | `{ "interface": "wg0" }` | Listen port, peer fingerprints, endpoints, allowed IPs, handshake and transfer counters |
| `get_tunnel_health` | `{}` | HTTP observer health document, when the HTTP backend exposes `/api/status` |
| `restart_interface` | `{ "interface": "wg0" }` | Restart one admitted interface after verifying it exists |

Writes are off until `WIREGUARD_ENABLE_WRITES=true`. Interfaces must be listed in `WIREGUARD_ADMITTED_INTERFACES` when you want an allowlist. The local backend requires that allowlist.

## HTTP interface document

`GET /api/interfaces/wg0`:

```json
{
  "listenPort": 51820,
  "peers": [
    {
      "publicKeyFingerprint": "sha256:…",
      "endpoint": "203.0.113.10:51820",
      "allowedIps": ["10.10.0.0/24"],
      "latestHandshakeSeconds": 12,
      "transferRx": 1,
      "transferTx": 1
    }
  ]
}
```

`POST /api/interfaces/wg0/restart` is the optional write. If you already run the kit observer, set `WIREGUARD_BASE_URL` to that observer; `/api/status` remains available as `get_tunnel_health`.

## Install and configure

```sh
git clone https://github.com/landynsnipes/enterprise-mcp-kit.git
cd enterprise-mcp-kit
npm ci
npm run validate
```

HTTP:

```sh
export WIREGUARD_BACKEND="http"
export WIREGUARD_BASE_URL="https://wg-status.example.com"
export WIREGUARD_ADMITTED_INTERFACES="wg0,wg1"
export WIREGUARD_ENABLE_WRITES="false"
npm run mcp:wireguard
```

Local:

```sh
export WIREGUARD_BACKEND="local"
export WIREGUARD_ADMITTED_INTERFACES="wg0"
export WIREGUARD_ENABLE_WRITES="true"
npm run mcp:wireguard
```

## Connect an AI client

```json
{
  "mcpServers": {
    "wireguard-context": {
      "command": "node",
      "args": ["/opt/enterprise-mcp-kit/dist/src/wireguard-server.js"],
      "env": {
        "WIREGUARD_BACKEND": "http",
        "WIREGUARD_BASE_URL": "https://wg-status.example.com",
        "WIREGUARD_ADMITTED_INTERFACES": "wg0",
        "WIREGUARD_ENABLE_WRITES": "false"
      }
    }
  }
}
```

## How to use it

- “Show WireGuard interface `wg0` without private keys.”
- “How many peers are on `wg0`, and how old is the newest handshake?”
- “Restart `wg0` only if it is an admitted interface.”

## Validate before production use

1. Confirm private keys never appear in tool output.
2. Confirm a non-admitted interface name is rejected.
3. If writes are enabled, restart one non-production interface and confirm the unit or HTTP restart endpoint is the only mutation.
4. Record the repository release and WireGuard/OS version.
