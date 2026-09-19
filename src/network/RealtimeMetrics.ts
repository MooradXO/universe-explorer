export const REALTIME_EVENTS = ['position', 'shoot', 'hit', 'die', 'chat', 'sonar', 'voice-signal'] as const;
export type RealtimeEvent = typeof REALTIME_EVENTS[number];

/** Counts client send attempts and delivered callbacks, not Supabase billing. No payloads retained. */
export class RealtimeMetrics {
  private readonly sent = Object.fromEntries(REALTIME_EVENTS.map((event) => [event, 0])) as Record<RealtimeEvent, number>;
  private readonly received = { ...this.sent };

  recordSent(event: RealtimeEvent): void { this.sent[event] += 1; }
  recordReceived(event: RealtimeEvent): void { this.received[event] += 1; }

  snapshot() {
    return {
      sendAttempts: Object.values(this.sent).reduce((sum, value) => sum + value, 0),
      received: Object.values(this.received).reduce((sum, value) => sum + value, 0),
      byEvent: Object.fromEntries(REALTIME_EVENTS.map((event) => [event, {
        sendAttempts: this.sent[event], received: this.received[event],
      }])),
    };
  }
}
