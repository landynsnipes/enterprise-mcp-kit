# Contributing

This kit ships bounded MCP jobs for systems operators already run. Keep that
contract. Do not add a generic vendor API, shell, or SDK dump.

## Two entry paths

- **Use an MCP:** exact-object tools against an existing system. Start with
  [docs/use-an-mcp.md](docs/use-an-mcp.md).
- **Run the lab:** optional NetBox and AIOps evaluation proofs. Start with
  [docs/run-the-lab.md](docs/run-the-lab.md).

Do not mix lab-only paths into connector defaults.

## Connector rules

A new or changed connector must:

- accept exact identifiers only (no broad list or search tools);
- keep writes off unless the matching `*_ENABLE_WRITES=true` flag is set;
- require an expected current value for any mutation;
- never return tokens, private keys, or raw upstream bodies;
- include mocked tests and a connect-existing guide;
- record supported vendor versions in [docs/compatibility.md](docs/compatibility.md).

Do not add another vendor until the six shipped connectors are released,
installable, and documented.

## Pull requests

Keep each pull request to one connector or one repository-wide fix. Before you
open it:

- `npm run validate`
- no personal homedir paths in `src/`, `test/`, or `scripts/`
- no credentials, customer data, or production URLs
- update `CHANGELOG.md` under Unreleased

## License

Contributions are accepted under the [Apache License 2.0](LICENSE).
