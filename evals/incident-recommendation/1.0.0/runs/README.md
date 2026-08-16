# Frozen live runs

No live-model baseline has been published yet. This directory holds the
artifact contract for a future run.

Each file is one complete baseline or comparison experiment.

Required provenance: `recordedAt`, `commitSha`, schema/prompt/corpus
versions, `promptSha256`, provider, model, `costMethodology`, per-case
scores, sanitized model text, latency, and token usage.

Do not commit API keys or unsanitized secrets. CI never writes here.
