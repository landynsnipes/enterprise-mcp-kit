import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncidentEvidence } from './aiops-incident.js';
import { incidentAction, incidentTarget } from './aiops-incident.js';
import {
  INCIDENT_EXPLAINER_V1,
  INCIDENT_RECOMMENDATION_EVAL_VERSION,
  INCIDENT_RECOMMENDATION_PROMPT_VERSION,
  INCIDENT_RECOMMENDATION_SCHEMA_VERSION,
  scoreIncidentRecommendation,
  type RecommendationScore,
} from './incident-recommendation.js';

export type EvalCaseExpected = Pick<RecommendationScore, 'schemaValid' | 'actionAccurate' | 'targetAccurate' | 'evidenceGrounded' | 'unsafe'>;

export type IncidentRecommendationEvalCase = {
  id: string;
  category: string;
  now: string;
  evidence: IncidentEvidence[];
  stimulus?: {
    now?: string;
    evidence?: IncidentEvidence[];
    note?: string;
  };
  rawOutput: string;
  expected: EvalCaseExpected;
};

export type CompletionUsage = {
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

export type RecommendationCompleter = {
  provider: string;
  modelVersion: string;
  complete(input: { system: string; user: string }): Promise<{ text: string } & CompletionUsage>;
};

export type CaseResult = {
  id: string;
  category: string;
  evidenceSha256: string;
  rawOutputSha256: string;
  rawOutputSanitized: string;
  score: RecommendationScore;
  expected: EvalCaseExpected;
  matchedExpected: boolean;
  usage: CompletionUsage;
};

export type CostMethodology = {
  currency: 'USD';
  inputUsdPerMillionTokens: number | null;
  outputUsdPerMillionTokens: number | null;
  source: string;
  notes: string;
};

export type EvalReport = {
  recordedAt: string;
  commitSha: string | null;
  evalVersion: typeof INCIDENT_RECOMMENDATION_EVAL_VERSION;
  schemaVersion: typeof INCIDENT_RECOMMENDATION_SCHEMA_VERSION;
  promptVersion: typeof INCIDENT_RECOMMENDATION_PROMPT_VERSION;
  promptSha256: string;
  mode: 'offline' | 'live';
  provider: string;
  modelVersion: string | null;
  costMethodology: CostMethodology | null;
  caseCount: number;
  cases: CaseResult[];
  summary: {
    schemaValidCount: number;
    actionAccurateCount: number;
    targetAccurateCount: number;
    evidenceGroundedCount: number;
    safeCount: number;
    schemaValidRate: number;
    actionAccuracy: number;
    targetAccuracy: number;
    evidenceGroundingFailureRate: number;
    unsafeRecommendationRate: number;
    latencyMs: { count: number; min: number | null; max: number | null; mean: number | null };
    costUsdTotal: number | null;
    costUsdPerEvaluation: number | null;
  };
  claims: string[];
};

const defaultCorpusDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../evals/incident-recommendation/1.0.0');

export async function loadIncidentRecommendationCorpus(corpusDir = defaultCorpusDir): Promise<IncidentRecommendationEvalCase[]> {
  const manifest = JSON.parse(await readFile(path.join(corpusDir, 'manifest.json'), 'utf8')) as {
    evalVersion: string;
    schemaVersion: string;
    promptVersion: string;
    cases: string[];
  };
  if (manifest.evalVersion !== INCIDENT_RECOMMENDATION_EVAL_VERSION || manifest.schemaVersion !== INCIDENT_RECOMMENDATION_SCHEMA_VERSION || manifest.promptVersion !== INCIDENT_RECOMMENDATION_PROMPT_VERSION) {
    throw new Error('Incident recommendation eval corpus version does not match the admitted contract.');
  }
  const files = new Set(await readdir(path.join(corpusDir, 'cases')));
  const cases: IncidentRecommendationEvalCase[] = [];
  for (const fileName of manifest.cases) {
    if (!files.has(fileName)) throw new Error(`Missing eval case file: ${fileName}`);
    cases.push(JSON.parse(await readFile(path.join(corpusDir, 'cases', fileName), 'utf8')) as IncidentRecommendationEvalCase);
  }
  return cases;
}

export async function replayIncidentRecommendationEval(options: {
  corpusDir?: string;
  completer?: RecommendationCompleter;
  commitSha?: string | null;
  recordedAt?: string;
  costMethodology?: CostMethodology | null;
} = {}): Promise<EvalReport> {
  const cases = await loadIncidentRecommendationCorpus(options.corpusDir);
  const completer = options.completer;
  const results: CaseResult[] = [];
  for (const evalCase of cases) {
    const started = Date.now();
    const liveEvidence = evalCase.stimulus?.evidence ?? evalCase.evidence;
    const liveNow = evalCase.stimulus?.now ?? evalCase.now;
    const completion = completer
      ? await completer.complete({
        system: INCIDENT_EXPLAINER_V1,
        user: JSON.stringify({
          admittedAction: incidentAction,
          admittedTarget: incidentTarget,
          schemaVersion: INCIDENT_RECOMMENDATION_SCHEMA_VERSION,
          promptVersion: INCIDENT_RECOMMENDATION_PROMPT_VERSION,
          modelVersion: completer.modelVersion,
          now: liveNow,
          evidence: liveEvidence,
          note: evalCase.stimulus?.note ?? null,
        }),
      })
      : { text: evalCase.rawOutput, latencyMs: null, inputTokens: null, outputTokens: null, estimatedCostUsd: null };
    const scoredEvidence = completer ? liveEvidence : evalCase.evidence;
    const score = scoreIncidentRecommendation(completion.text, scoredEvidence);
    const usage: CompletionUsage = {
      latencyMs: completer ? completion.latencyMs ?? Date.now() - started : null,
      inputTokens: completion.inputTokens ?? null,
      outputTokens: completion.outputTokens ?? null,
      estimatedCostUsd: completion.estimatedCostUsd ?? null,
    };
    results.push({
      id: evalCase.id,
      category: evalCase.category,
      evidenceSha256: sha256(scoredEvidence),
      rawOutputSha256: sha256Text(completion.text),
      rawOutputSanitized: sanitizeModelText(completion.text),
      score,
      expected: evalCase.expected,
      matchedExpected: !completer && scoresMatch(score, evalCase.expected),
      usage,
    });
  }
  const latencies = results.map((item) => item.usage.latencyMs).filter((value): value is number => value !== null);
  const costs = results.map((item) => item.usage.estimatedCostUsd).filter((value): value is number => value !== null);
  return {
    recordedAt: options.recordedAt ?? new Date().toISOString(),
    commitSha: options.commitSha ?? process.env.INCIDENT_EVAL_COMMIT_SHA ?? null,
    evalVersion: INCIDENT_RECOMMENDATION_EVAL_VERSION,
    schemaVersion: INCIDENT_RECOMMENDATION_SCHEMA_VERSION,
    promptVersion: INCIDENT_RECOMMENDATION_PROMPT_VERSION,
    promptSha256: sha256Text(INCIDENT_EXPLAINER_V1),
    mode: completer ? 'live' : 'offline',
    provider: completer?.provider ?? 'offline-fixture',
    modelVersion: completer?.modelVersion ?? 'offline-fixture',
    costMethodology: options.costMethodology ?? null,
    caseCount: results.length,
    cases: results,
    summary: {
      schemaValidCount: results.filter((item) => item.score.schemaValid).length,
      actionAccurateCount: results.filter((item) => item.score.actionAccurate).length,
      targetAccurateCount: results.filter((item) => item.score.targetAccurate).length,
      evidenceGroundedCount: results.filter((item) => item.score.evidenceGrounded).length,
      safeCount: results.filter((item) => !item.score.unsafe).length,
      schemaValidRate: rate(results, (item) => item.score.schemaValid),
      actionAccuracy: rate(results, (item) => item.score.actionAccurate),
      targetAccuracy: rate(results, (item) => item.score.targetAccurate),
      evidenceGroundingFailureRate: rate(results, (item) => !item.score.evidenceGrounded),
      unsafeRecommendationRate: rate(results, (item) => item.score.unsafe),
      latencyMs: {
        count: latencies.length,
        min: latencies.length ? Math.min(...latencies) : null,
        max: latencies.length ? Math.max(...latencies) : null,
        mean: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : null,
      },
      costUsdTotal: costs.length ? costs.reduce((sum, value) => sum + value, 0) : null,
      costUsdPerEvaluation: costs.length ? costs.reduce((sum, value) => sum + value, 0) / costs.length : null,
    },
    claims: [
      'Default offline replay calls no production model and needs no API key or network.',
      'This track evaluates recommendation quality against a closed contract only.',
      'It does not establish production safety, live connector certification, or autonomous remediation.',
      'Model output never gains an execution path; admission remains the existing governed workflow.',
    ],
  };
}

export function assertOfflineEvalPassed(report: EvalReport): void {
  if (report.mode !== 'offline') throw new Error('CI replay must stay in offline mode.');
  const failed = report.cases.filter((item) => !item.matchedExpected);
  if (failed.length > 0) {
    throw new Error(`Offline incident recommendation eval failed: ${failed.map((item) => item.id).join(', ')}`);
  }
}

export async function createLiveCompleterFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<RecommendationCompleter | null> {
  if (env.INCIDENT_EVAL_LIVE !== 'true') return null;
  const endpoint = env.INCIDENT_EVAL_COMPLETION_URL;
  const apiKey = env.INCIDENT_EVAL_API_KEY;
  const provider = env.INCIDENT_EVAL_PROVIDER;
  const modelVersion = env.INCIDENT_EVAL_MODEL;
  if (!endpoint || !apiKey || !provider || !modelVersion) {
    throw new Error('Live incident evaluation requires INCIDENT_EVAL_COMPLETION_URL, INCIDENT_EVAL_API_KEY, INCIDENT_EVAL_PROVIDER, and INCIDENT_EVAL_MODEL.');
  }
  return {
    provider,
    modelVersion,
    async complete(input) {
      const started = Date.now();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ system: input.system, user: input.user, model: modelVersion }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Live completion endpoint returned HTTP ${response.status}.`);
      const body = await response.json() as {
        text?: unknown;
        usage?: { inputTokens?: unknown; outputTokens?: unknown; estimatedCostUsd?: unknown };
      };
      if (typeof body.text !== 'string') throw new Error('Live completion endpoint must return { text: string }.');
      return {
        text: body.text,
        latencyMs: Date.now() - started,
        inputTokens: numberOrNull(body.usage?.inputTokens),
        outputTokens: numberOrNull(body.usage?.outputTokens),
        estimatedCostUsd: numberOrNull(body.usage?.estimatedCostUsd),
      };
    },
  };
}

function scoresMatch(actual: RecommendationScore, expected: EvalCaseExpected): boolean {
  return actual.schemaValid === expected.schemaValid
    && actual.actionAccurate === expected.actionAccurate
    && actual.targetAccurate === expected.targetAccurate
    && actual.evidenceGrounded === expected.evidenceGrounded
    && actual.unsafe === expected.unsafe;
}

function rate(results: CaseResult[], predicate: (item: CaseResult) => boolean): number {
  return results.filter(predicate).length / results.length;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sanitizeModelText(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-secret]')
    .replace(/\bBearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted-secret]')
    .replace(/\b(api[_-]?key|token)\s*[:=]\s*\S+/gi, '$1=[redacted-secret]');
}

export function estimateUsdCost(inputTokens: number | null, outputTokens: number | null, methodology: CostMethodology | null): number | null {
  if (!methodology || methodology.inputUsdPerMillionTokens === null || methodology.outputUsdPerMillionTokens === null || inputTokens === null || outputTokens === null) {
    return null;
  }
  return (inputTokens * methodology.inputUsdPerMillionTokens + outputTokens * methodology.outputUsdPerMillionTokens) / 1_000_000;
}
