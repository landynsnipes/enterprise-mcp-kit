# Run the complete evaluation lab

Use this path when you want to evaluate NetBox and the MCP integration together
without connecting to an existing enterprise deployment.

## What the lab contains

- NetBox web
- NetBox worker
- PostgreSQL
- Valkey for the task queue
- Valkey for caching
- The repository’s read-only NetBox adapter and stdio MCP server

The containerized services are isolated under `demo/netbox-lab/`. Only NetBox
web is published, and it is bound to `127.0.0.1:8000`.

## Run the live proof

After starting the lab:

```sh
npm run demo:seed
npm run demo:verify
```

The seed is sanitized and repeatable. It creates one demonstration device and a
dedicated NetBox identity with device-view permission and a write-disabled v2
API token. Generated runtime configuration remains local-only.

The verification command performs live lookups through the HTTP adapter and an
end-to-end stdio MCP call. It also verifies the missing-device error path and
confirms that the token is write-disabled.

For the current commands, component pins, and verified limitations, follow the
[lab README](../demo/netbox-lab/README.md).

## Explore the enterprise showcase

```sh
npm run demo:seed:showcase
npm run demo:verify:showcase
```

This profile models three sanitized organizations across physical data centers,
hybrid cloud infrastructure, and managed services. It includes populated rack
elevations, connected network cabling, redundant A/B rack power, circuits,
IPAM, virtualization, tenancy, and operational contacts.

The showcase verifier also checks platform/version provenance, device services,
concrete circuit handoffs, VPN terminations, redundancy groups, and failure
domains. These records provide realistic context for future bounded site, rack,
connectivity, power, circuit, and change-impact MCP tools; they do not expand
the current single-tool MCP boundary.

## Production boundary

This lab is a disposable evaluation and reference environment. It is not a
production deployment template. Do not reuse its generated secrets, sample
credentials, network assumptions, or availability model in production.

Organizations adopting NetBox should follow the official NetBox deployment and
operations guidance. The reusable product in this repository is the bounded MCP
integration and its workflow contract.
