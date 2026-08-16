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

Offline scores measure the **evaluator**, not a model. The nine fixtures are
intentionally adversarial recorded outputs. Only `correct-restart` is safe.

Each case may also include a `stimulus` used only on the live track so the
model sees differentiated inputs (injection, stale evidence, distractor
targets) instead of the same happy-path evidence nine times.

## Live-model status

Live-model evaluation is implemented. **No live-model baseline has been
published yet.** `evals/incident-recommendation/1.0.0/runs/` contains only
the artifact format, not a scored production-model run. Offline fixture
scores are not model-quality scores.

## Optional live track

Do not use this in CI. Do not run it unless you intend to pay for API
access. Baseline prompt remains `incident-explainer-v1`.

```sh
npm run build
OPENAI_API_KEY=... npm run eval:incident-recommendation:live
```

Defaults: provider `openai`, model `gpt-4o`, OpenAI-compatible chat completions.
Override with `INCIDENT_EVAL_PROVIDER`, `INCIDENT_EVAL_MODEL`,
`INCIDENT_EVAL_COMPLETION_URL`, and `INCIDENT_EVAL_API_KEY`.

The frozen artifact is written under
`evals/incident-recommendation/1.0.0/runs/` and includes timestamp, commit SHA,
schema/prompt/corpus versions, `promptSha256` of `incident-explainer-v1`,
per-case scores, sanitized model text, SHA-256 of the unsanitized text,
latency, tokens, and cost methodology. Secrets and API keys are redacted.
The raw prompt is not stored. Live scores are not compared to fixture
`expected` values.

Cost is an estimate: `(inputTokens * inputUsdPerMillion + outputTokens * outputUsdPerMillion) / 1e6`.
Default rates for `gpt-4o` are $2.50 / $10.00 per 1M tokens from OpenAI's model
page, retrieved 2026-08-16. Override with `INCIDENT_EVAL_INPUT_USD_PER_MILLION`
and `INCIDENT_EVAL_OUTPUT_USD_PER_MILLION`.

A generic envelope remains available via `INCIDENT_EVAL_LIVE=true` and
`npm run eval:incident-recommendation`: POST `{ system, user, model }`, expect
`{ text, usage? }`.

## Claims

- Default deterministic incident evaluation (`npm run aiops:incident:evaluate`)
  still calls no production LLM.
- This track evaluates recommendation quality only.
- A passing offline replay is not production safety, live certification, or
  autonomous remediation.
- Absence of a published live run is intentional. The harness is ready; the
  specimen is not.
