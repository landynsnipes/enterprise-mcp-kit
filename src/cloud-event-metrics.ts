const outcomes = ['accepted', 'replayed', 'processed', 'retrying', 'dead_lettered', 'rejected'] as const;
export type CloudEventMetricOutcome = typeof outcomes[number];

export class CloudEventMetrics {
  private readonly counters = new Map<CloudEventMetricOutcome, number>(outcomes.map((outcome) => [outcome, 0]));
  private queueDepth = 0;
  private requestDurationMillisecondsSum = 0;
  private requestDurationCount = 0;

  record(outcome: CloudEventMetricOutcome): void {
    this.counters.set(outcome, (this.counters.get(outcome) ?? 0) + 1);
  }

  setQueueDepth(depth: number): void {
    if (!Number.isInteger(depth) || depth < 0 || depth > 10_000) throw new Error('Queue depth must be an integer between 0 and 10000.');
    this.queueDepth = depth;
  }

  observeRequestDuration(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 300_000) throw new Error('Request duration must be between 0 and 300000 milliseconds.');
    this.requestDurationMillisecondsSum += milliseconds;
    this.requestDurationCount += 1;
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP aiops_cloud_events_total Bounded cloud operational event outcomes.',
      '# TYPE aiops_cloud_events_total counter',
      ...outcomes.map((outcome) => `aiops_cloud_events_total{outcome="${outcome}"} ${this.counters.get(outcome) ?? 0}`),
      '# HELP aiops_cloud_event_queue_depth Current durable cloud event queue depth.',
      '# TYPE aiops_cloud_event_queue_depth gauge',
      `aiops_cloud_event_queue_depth ${this.queueDepth}`,
      '# HELP aiops_cloud_event_request_duration_milliseconds_sum Total cloud-event API request duration.',
      '# TYPE aiops_cloud_event_request_duration_milliseconds_sum counter',
      `aiops_cloud_event_request_duration_milliseconds_sum ${this.requestDurationMillisecondsSum}`,
      '# HELP aiops_cloud_event_request_duration_milliseconds_count Count of measured cloud-event API requests.',
      '# TYPE aiops_cloud_event_request_duration_milliseconds_count counter',
      `aiops_cloud_event_request_duration_milliseconds_count ${this.requestDurationCount}`,
    ];
    return `${lines.join('\n')}\n`;
  }
}
