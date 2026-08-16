import { assertOfflineEvalPassed, createLiveCompleterFromEnv, replayIncidentRecommendationEval } from '../dist/src/incident-recommendation-eval.js';

const completer = await createLiveCompleterFromEnv();
const report = await replayIncidentRecommendationEval({ completer: completer ?? undefined });
if (report.mode === 'offline') assertOfflineEvalPassed(report);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
