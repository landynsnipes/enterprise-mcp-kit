# Third-party component policy and notices

This file records the components intentionally selected by the repository. It
is an engineering inventory, not legal advice. Enterprises should perform their
own legal review before redistribution.

## Included or required components

| Component | Pinned/tested version | Declared license | Role |
| --- | --- | --- | --- |
| NetBox Community | 4.6.5 | Apache-2.0 | Infrastructure source of truth |
| NetBox Docker | 5.0.2 | Apache-2.0 | Evaluation container distribution |
| PostgreSQL | 18 | PostgreSQL License | Database |
| Valkey | 9.1 | BSD-3-Clause | Task queue and cache |
| NATS Server with JetStream | 2.14.3 | Apache-2.0 | Optional durable local cloud-event broker |
| MCP TypeScript SDK | 1.30.0 | MIT in installed package metadata | MCP protocol |
| NATS Node transport | 3.4.0 | Apache-2.0 | Optional local cloud-event transport |
| NATS JetStream client | 3.4.0 | Apache-2.0 | Optional durable event stream and worker delivery |
| TweetNaCl.js | 1.0.3 transitive through NATS nkeys | Unlicense | NATS authentication cryptography dependency |
| Zod | 4.4.3 | MIT | Runtime contract validation |
| TypeScript | 5.9.3 currently installed | Apache-2.0 | Development compiler |
| bcrypt.js | 3.0.3 | BSD-3-Clause | Development-only local NATS credential hashing |
| Node type definitions | 22.20.1 currently installed | MIT | Development types |

The exact authoritative component inventory is
[`config/enterprise-distribution.json`](config/enterprise-distribution.json).
The package lock remains authoritative for installed npm transitive versions.

## Candidate plugins

| Plugin | Candidate version | Declared license | Status |
| --- | --- | --- | --- |
| NetBox Lifecycle | 1.1.7 | Apache-2.0 | Not installed and not supported |

Candidate status means the component appears suitable for evaluation. It is not
part of the supported distribution until every admission test in
`ENTERPRISE-DISTRIBUTION.md` passes.

## Approved license identifiers

- Apache-2.0
- MIT
- BSD-2-Clause
- BSD-3-Clause
- ISC
- Unlicense
- PostgreSQL

Approval applies to the identified component and version, not automatically to
all future versions, optional extras, container contents, or transitive
dependencies. The `Unlicense` admission is limited to the locked TweetNaCl.js
1.0.3 transitive dependency; its bundled notice dedicates the software to the
public domain and provides it without warranty. This remains subject to normal
redistribution review and is not legal advice.

## Rejected distribution dependencies

Core functionality must not require:

- proprietary or paid-only software;
- a mandatory commercial cloud service;
- SSPL, Business Source License, Elastic License 2.0, or unreviewed
  source-available terms; or
- a plugin whose license, source, compatibility, or migration path is unclear.

External enterprises may integrate commercial products independently. Those
integrations must remain optional and must not weaken the FOSS core.

## Release review

Before release:

1. run `npm ci`;
2. run `npm run validate:distribution`;
3. review changes to `package-lock.json`;
4. verify container source, license, and digest;
5. review every plugin and its transitive dependencies; and
6. update this notice and the machine-readable inventory.
