export type WarpPhase = 'idle' | 'charge' | 'entry' | 'tunnel' | 'exit' | 'cancel';
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };

/** Visual time never commits travel. Only confirmed arrival can open the exit. */
export class WarpTimeline {
  phase: WarpPhase = 'idle';
  elapsed = 0;
  requested = false;
  intensity = 0;
  private fadeStart = 0;
  update(dt: number, confirmed: boolean) {
    if (confirmed && !this.requested) { this.phase = 'charge'; this.elapsed = 0; }
    this.requested = confirmed;
    if (!confirmed && ['charge', 'entry', 'tunnel'].includes(this.phase)) {
      this.phase = 'cancel'; this.elapsed = 0; this.fadeStart = this.intensity;
    }
    if (this.phase === 'idle') return;
    this.elapsed += Math.max(0, Number.isFinite(dt) ? dt : 0);
    if (this.phase === 'exit' || this.phase === 'cancel') {
      const duration = this.phase === 'exit' ? .9 : .24;
      this.intensity = this.fadeStart * (1 - smooth(this.elapsed / duration));
      if (this.elapsed >= duration) this.clear();
    } else {
      this.phase = this.elapsed < .55 ? 'charge' : this.elapsed < 1.4 ? 'entry' : 'tunnel';
      this.intensity = .18 * smooth(this.elapsed / .55) + .82 * smooth((this.elapsed - .55) / .85);
    }
  }
  arrive() {
    if (!['charge', 'entry', 'tunnel'].includes(this.phase)) return;
    this.phase = 'exit'; this.elapsed = 0; this.requested = false; this.fadeStart = Math.max(.35, this.intensity);
  }
  get field() { return ['exit', 'cancel'].includes(this.phase) ? this.fadeStart : smooth((this.elapsed - .5) / .9); }
  get aperture() { return this.phase === 'exit' ? smooth(this.elapsed / .8) * 2.2 : 0; }
  get portalRadius() { return .05 + .18 * smooth(this.elapsed / .55) + 2.3 * smooth((this.elapsed - .55) / .85); }
  clear() { this.phase = 'idle'; this.elapsed = 0; this.requested = false; this.intensity = 0; this.fadeStart = 0; }
}
