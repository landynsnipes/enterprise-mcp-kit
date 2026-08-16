import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  estimateUsdCost,
  replayIncidentRecommendationEval,
} from '../dist/src/incident-recommendation-eval.js';

const run = promisify(execFile);
const provider = process.env.INCIDENT_EVAL_PROVIDER ?? 'openai';
const model = process.env.INCIDENT_EVAL_MODEL ?? 'gpt-4o';
const apiKey = process.env.INCIDENT_EVAL_API_KEY ?? process.env.OPENAI_API_KEY;
const endpoint = process.env.INCIDENT_EVAL_COMPLETION_URL ?? 'https://api.openai.com/v1/chat/completions';
if (!apiKey) {
  throw new Error('Set OPENAI_API_KEY or INCIDENT_EVAL_API_KEY to run the live baseline. Do not commit the key.');
}

const costMethodology = {
  currency: 'USD',
  inputUsdPerMillionTokens: Number(process.env.INCIDENT_EVAL_INPUT_USD_PER_MILLION ?? 2.5),
  outputUsdPerMillionTokens: Number(process.env.INCIDENT_EVAL_OUTPUT_USD_PER_MILLION ?? 10),
  source: process.env.INCIDENT_EVAL_PRICE_SOURCE ?? 'https://developers.openai.com/api/docs/models/gpt-4o retrieved 2026-08-16',
  notes: 'Estimate only. input*rate + output*rate per 1M tokens. Cached/batch discounts are not applied. Override rates with INCIDENT_EVAL_INPUT_USD_PER_MILLION and INCIDENT_EVAL_OUTPUT_USD_PER_MILLION.',
};

const completer = {
  provider,
  modelVersion: model,
  async complete({ system, user }) {
    const started = Date.now();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Live completion returned HTTP ${response.status}.`);
    const body = await response.json();
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new Error('OpenAI-compatible response did not include choices[0].message.content.');
    const inputTokens = Number.isFinite(body?.usage?.prompt_tokens) ? body.usage.prompt_tokens : null;
    const outputTokens = Number.isFinite(body?.usage?.completion_tokens) ? body.usage.completion_tokens : null;
    return {
      text,
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateUsdCost(inputTokens, outputTokens, costMethodology),
    };
  },
};

const commitSha = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim();
const report = await replayIncidentRecommendationEval({
  completer,
  commitSha,
  costMethodology,
});
const outDir = path.resolve('evals/incident-recommendation/1.0.0/runs');
await mkdir(outDir, { recursive: true });
const stamp = report.recordedAt.replace(/[:.]/g, '-');
const outFile = path.join(outDir, `${stamp}-${provider}-${model}-incident-explainer-v1.json`);
await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ artifact: outFile, summary: report.summary, claims: report.claims }, null, 2)}\n`);
