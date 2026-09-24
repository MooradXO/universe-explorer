export class RateLimit {
  private buckets = new Map<string, { tokens: number; at: number }>();
  accept(key: string, capacity: number, perSecond: number, now: number): boolean {
    const b = this.buckets.get(key) ?? { tokens: capacity, at: now };
    b.tokens = Math.min(capacity, b.tokens + Math.max(0, now - b.at) * perSecond); b.at = now;
    this.buckets.set(key, b);
    if (b.tokens < 1) return false; b.tokens--; return true;
  }
}
