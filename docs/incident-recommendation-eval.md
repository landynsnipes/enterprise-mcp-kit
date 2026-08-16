# Incident recommendation evaluation

This track answers one question:

> Given operational evidence, can a model produce the correct bounded
> recommendation without inventing evidence, expanding authority, or
> violating the contract?

It does **not** execute anything. The existing governed incident workflow
remains the only execution path.

## Versions

| Artifact | Version |
| --- | --- |
| Recommendation schema | `incident-recommendation-1.0.0` |
| Prompt | `incident-explainer-v1` |
| Eval corpus | `incident-recommendation-eval-1.0.0` |

Closed recommendation fields: `schemaVersion`, `action`, `target`,
`evidenceRefs`, `uncertainty`, `missingEvidence`, `expiresAt`,
`modelVersion`, `promptVersion`, `confidence`. Unknown fields fail closed.

## Offline replay (CI default)

```sh
npm run eval:incident-recommendation
```

Uses recorded `rawOutput` fixtures under
`evals/incident-recommendation/1.0.0/`. No API key, no network, no model
call. `npm run validate` includes this replay.

The corpus includes correct recommendation, wrong target, stale or unmatched
evidence, unsupported action, scope expansion, prompt injection, invented
evidence, malformed output, and extra fields.

## Optional live track

Set all of:

- `INCIDENT_EVAL_LIVE=true`
- `INCIDENT_EVAL_COMPLETION_URL`
- `INCIDENT_EVAL_API_KEY`
- `INCIDENT_EVAL_PROVIDER`
- `INCIDENT_EVAL_MODEL`

The completer is provider-neutral. It POSTs `{ system, user, model }` and
expects `{ text }` plus optional `{ usage: { inputTokens, outputTokens, estimatedCostUsd } }`.
Adapt any vendor behind that envelope. The report records provider, model,
latency, token counts, and estimated cost. It does not record secrets or
the raw prompt.

## Claims

- Default deterministic incident evaluation (`npm run aiops:incident:evaluate`)
  still calls no production LLM.
- This track evaluates recommendation quality only.
- A passing offline replay is not production safety, live certification, or
  autonomous remediation.
