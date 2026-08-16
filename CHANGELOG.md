# Changelog

## Unreleased

- Add a versioned, provider-neutral incident recommendation eval: closed
  schema, adversarial fixture corpus, deterministic offline CI replay, and
  an optional live completer that never executes.
- Record live-eval provenance (timestamp, commit SHA, prompt hash, sanitized
  raw output, token/cost methodology) and per-case live stimuli for the
  baseline `incident-explainer-v1` experiment. No live-model baseline is
  published.
- Add an AT evidence case study that restates already-executed lab
  measurements and their limitations. No customer or production outcomes.

## 0.2.0 - 2026-08-15

- Add bounded Grafana, Zabbix, WireGuard, Kubernetes plus Ansible, and OPNsense MCP servers.
- Publish installable `bin` commands and an stdio MCP container entrypoint.
- Resolve the governed incident playbook from the repository or `INCIDENT_PLAYBOOK`.
- Add security policy, contributing guide, compatibility matrix, and a 5-minute MCP path.

## 0.1.0

- Initial NetBox read tools, governed write gateway, evaluation lab, and release gates.
