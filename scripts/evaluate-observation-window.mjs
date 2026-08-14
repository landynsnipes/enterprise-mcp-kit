import fs from 'node:fs';

const exactId = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
const required = ['SAMPLES_PATH', 'EVIDENCE_PATH', 'TRACE', 'CORRELATION_ID', 'ACTION_REFERENCE', 'SAMPLES_REQUIRED', 'MINIMUM_WINDOW_SECONDS', 'CPU_LIMIT_MILLICORES'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required.`);
for (const name of ['TRACE', 'CORRELATION_ID', 'ACTION_REFERENCE']) if (!exactId.test(process.env[name])) throw new Error(`${name} is invalid.`);

const samples = fs.readFileSync(process.env.SAMPLES_PATH, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
const samplesRequired = Number(process.env.SAMPLES_REQUIRED);
if (!Number.isInteger(samplesRequired) || samplesRequired < 2 || samples.length !== samplesRequired) throw new Error('The exact required observation sample count was not collected.');
const numericFields = ['sampledEpoch', 'desiredReplicas', 'readyReplicas', 'updatedReplicas', 'unavailableReplicas', 'restartCount', 'cpuMillicores', 'highCpuAlertsFiring'];
for (const sample of samples) {
  if (!sample || Object.keys(sample).sort().join(',') !== [...numericFields, 'observerHealthy', 'sampledAt'].sort().join(',')) throw new Error('Observation sample schema is invalid.');
  const sampledAtEpoch = Date.parse(sample.sampledAt) / 1000;
  if (!numericFields.every((field) => Number.isFinite(sample[field]) && sample[field] >= 0) || typeof sample.observerHealthy !== 'boolean' || !Number.isFinite(sampledAtEpoch) || Math.abs(sample.sampledEpoch - sampledAtEpoch) > 1) throw new Error('Observation sample values are invalid.');
}
if (samples.some((sample, index) => index > 0 && (sample.sampledEpoch <= samples[index - 1].sampledEpoch || Date.parse(sample.sampledAt) <= Date.parse(samples[index - 1].sampledAt)))) throw new Error('Observation samples must be strictly chronological.');

const minimumWindowSeconds = Number(process.env.MINIMUM_WINDOW_SECONDS);
const cpuLimitMillicores = Number(process.env.CPU_LIMIT_MILLICORES);
if (!Number.isInteger(minimumWindowSeconds) || minimumWindowSeconds < 1 || !Number.isFinite(cpuLimitMillicores) || cpuLimitMillicores <= 0) throw new Error('Observation thresholds are invalid.');
const durationSeconds = samples.at(-1).sampledEpoch - samples[0].sampledEpoch;
const baselineRestarts = samples[0].restartCount;
const failures = [];
if (durationSeconds < minimumWindowSeconds) failures.push('observation_window_too_short');
if (samples.some((sample) => sample.desiredReplicas < 1 || sample.readyReplicas !== sample.desiredReplicas || sample.updatedReplicas !== sample.desiredReplicas || sample.unavailableReplicas !== 0)) failures.push('replica_readiness_threshold_failed');
if (samples.some((sample) => sample.restartCount > baselineRestarts)) failures.push('restart_count_increased');
if (samples.some((sample) => !sample.observerHealthy)) failures.push('telemetry_unavailable');
if (samples.some((sample) => sample.cpuMillicores > cpuLimitMillicores)) failures.push('cpu_threshold_exceeded');
if (samples.some((sample) => sample.highCpuAlertsFiring !== 0)) failures.push('high_cpu_alert_fired');

const evidence = {
  schemaVersion: 1,
  acceptanceTest: 'AT-09',
  result: failures.length === 0 ? 'passed' : 'non-success',
  tenantId: 'open-enterprise-aiops',
  site: 'las',
  target: 'deployment/cloud-reference',
  actionReference: process.env.ACTION_REFERENCE,
  correlationId: process.env.CORRELATION_ID,
  decisionTraceId: process.env.TRACE,
  startedAt: samples[0].sampledAt,
  completedAt: samples.at(-1).sampledAt,
  durationSeconds,
  thresholds: { samplesRequired, minimumWindowSeconds, cpuLimitMillicores, unavailableReplicas: 0, restartIncrease: 0, highCpuAlertsFiring: 0, telemetryRequired: true },
  summary: {
    samples: samples.length,
    desiredReplicas: samples[0].desiredReplicas,
    minimumReadyReplicas: Math.min(...samples.map((sample) => sample.readyReplicas)),
    maximumUnavailableReplicas: Math.max(...samples.map((sample) => sample.unavailableReplicas)),
    baselineRestarts,
    maximumRestarts: Math.max(...samples.map((sample) => sample.restartCount)),
    maximumCpuMillicores: Math.max(...samples.map((sample) => sample.cpuMillicores)),
    maximumHighCpuAlertsFiring: Math.max(...samples.map((sample) => sample.highCpuAlertsFiring)),
    telemetrySamplesAvailable: samples.filter((sample) => sample.observerHealthy).length,
  },
  failures,
  samples,
  autonomousRemediation: false,
  claimsBoundary: 'Post-action observation of one LAS logical Kubernetes deployment on a shared WSL host; not independent-site HA or autonomous remediation.',
};
fs.writeFileSync(process.env.EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({ result: evidence.result, acceptanceTest: evidence.acceptanceTest, durationSeconds, samples: samples.length, correlationId: evidence.correlationId, decisionTraceId: evidence.decisionTraceId, failures }));
if (failures.length) process.exitCode = 1;
