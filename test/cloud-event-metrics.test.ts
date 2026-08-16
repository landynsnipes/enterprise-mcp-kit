import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudEventMetrics } from '../src/cloud-event-metrics.js';

test('renders bounded low-cardinality Prometheus event outcomes and queue depth', () => {
  const metrics = new CloudEventMetrics();
  metrics.record('accepted');
  metrics.record('accepted');
  metrics.record('retrying');
  metrics.setQueueDepth(3);
  metrics.observeRequestDuration(12.5);
  metrics.observeRequestDuration(7.5);
  const rendered = metrics.renderPrometheus();
  assert.match(rendered, /aiops_cloud_events_total\{outcome="accepted"\} 2/);
  assert.match(rendered, /aiops_cloud_events_total\{outcome="retrying"\} 1/);
  assert.match(rendered, /aiops_cloud_event_queue_depth 3/);
  assert.match(rendered, /aiops_cloud_event_request_duration_milliseconds_sum 20/);
  assert.match(rendered, /aiops_cloud_event_request_duration_milliseconds_count 2/);
  assert.doesNotMatch(rendered, /tenant|eventId|correlationId|decisionTraceId/);
});

test('rejects invalid queue depth rather than emitting misleading telemetry', () => {
  const metrics = new CloudEventMetrics();
  assert.throws(() => metrics.setQueueDepth(-1));
  assert.throws(() => metrics.setQueueDepth(10_001));
  assert.throws(() => metrics.setQueueDepth(1.2));
  assert.throws(() => metrics.observeRequestDuration(-1));
  assert.throws(() => metrics.observeRequestDuration(Number.POSITIVE_INFINITY));
});
