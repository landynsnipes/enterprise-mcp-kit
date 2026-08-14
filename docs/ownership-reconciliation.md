# Intended versus runtime ownership reconciliation

Run the bounded, read-only report with:

```bash
npm run aiops:ownership:verify
```

The verifier reads the existing mode-600 NetBox lab token, queries exactly one
site and one edge device per logical site, and combines those intended-state
records with exact Kubernetes Deployment, CPU observer, Prometheus alert, and
WireGuard observer reads. It never writes NetBox or runtime state and never
enumerates arbitrary endpoints.

Every record includes a source owner, source reference, observation timestamp,
tenant, correlation ID, and decision trace ID. `unknown` is used when a runtime
source is unavailable. NetBox is not used to infer pod health, CPU, alert state,
WireGuard forwarding, or live electrical delivery.

The report intentionally records live electrical load, breaker state, and actual
power delivery as unknown because this WSL lab has no electrical telemetry.

The first live run returned `non-success`: the exact NetBox queries returned
zero records for `las-vegas-lab`, `chicago-lab`, `aiops-las-edge-01`, and
`aiops-chi-edge-01`, while Kubernetes, Prometheus, and WireGuard runtime reads
were available. This is an intentional source-of-truth gap. The verifier does
not create records; use the existing governed provisioning workflow with a
separately reviewed plan, approval digest, and rollback evidence before rerunning
this report.
