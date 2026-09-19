/** Wall-clock frame durations; simulation's clamped delta must never reach here. */
export class FrameMetrics {
  private readonly samples = new Float64Array(180);
  private cursor = 0;
  private count = 0;

  record(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    this.samples[this.cursor] = seconds * 1000;
    this.cursor = (this.cursor + 1) % this.samples.length;
    this.count = Math.min(this.count + 1, this.samples.length);
  }

  snapshot() {
    const values = Array.from(this.samples.subarray(0, this.count)).sort((a, b) => a - b);
    const frameTimeMs = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return {
      fps: frameTimeMs ? 1000 / frameTimeMs : 0,
      frameTimeMs,
      p95FrameTimeMs: values[Math.max(0, Math.ceil(values.length * 0.95) - 1)] ?? 0,
      sampleFrames: values.length,
    };
  }
}
