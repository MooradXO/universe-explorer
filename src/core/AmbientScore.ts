/** Original instrumental score, "Far Horizons". No recordings, downloads or external stream. */
export const AMBIENT_CHORDS = [
  [45, 52, 59, 64], [41, 48, 57, 64], [48, 55, 59, 62], [43, 50, 57, 62],
  [45, 52, 60, 67], [41, 48, 55, 64], [38, 45, 57, 64], [43, 50, 59, 66],
] as const;
export const AMBIENT_BAR_SECONDS = 16;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** The audio clock schedules complete phrases; the main thread only keeps a short lookahead. */
export class AmbientScore {
  private output: GainNode;
  private dry: GainNode;
  private filter: BiquadFilterNode;
  private delay: DelayNode;
  private feedback: GainNode;
  private reverb: ConvolverNode;
  private wet: GainNode;
  private active = new Set<OscillatorNode>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextAt = 0;
  private bar = 0;
  private stopped = false;
  constructor(private ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
    this.output = ctx.createGain(); this.output.gain.value = 0; this.output.connect(destination);
    this.dry = ctx.createGain(); this.dry.gain.value = .8; this.dry.connect(this.output);
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 1900; this.filter.Q.value = .5;
    this.filter.connect(this.dry);
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = .75;
    this.feedback = ctx.createGain(); this.feedback.gain.value = .32;
    this.filter.connect(this.delay); this.delay.connect(this.feedback); this.feedback.connect(this.delay); this.feedback.connect(this.output);
    this.reverb = ctx.createConvolver();
    const impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * 2.8), ctx.sampleRate);
    let seed = 78413;
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; samples[i] = (seed / 2 ** 31 - 1) * (1 - i / samples.length) ** 3; }
    }
    this.reverb.buffer = impulse; this.wet = ctx.createGain(); this.wet.gain.value = .35;
    this.filter.connect(this.reverb); this.reverb.connect(this.wet); this.wet.connect(this.output);
  }
  setVolume(volume: number) { this.output.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * 2.2, this.ctx.currentTime, .18); }
  start() {
    if (this.timer || this.stopped) return;
    this.nextAt = this.ctx.currentTime + .06;
    this.pump(); this.timer = setInterval(() => this.pump(), 200);
  }
  private pump() {
    if (this.ctx.state !== 'running' || this.stopped) return;
    // Never catch up a long backlog after suspension/background throttling.
    if (this.nextAt < this.ctx.currentTime - .5) this.nextAt = this.ctx.currentTime + .06;
    if (this.nextAt < this.ctx.currentTime + .5) { this.scheduleBar(this.bar++, this.nextAt); this.nextAt += AMBIENT_BAR_SECONDS; }
  }
  scheduleBar(index: number, at: number) {
    const chord = AMBIENT_CHORDS[index % AMBIENT_CHORDS.length];
    for (let i = 0; i < chord.length; i++) {
      this.tone(chord[i], at, 19, .057, 'sine', -.65 + i * .43, -3, 2.8);
      this.tone(chord[i], at + .06, 19, .022, 'triangle', .65 - i * .43, 3, 3.4);
    }
    // Space between notes is intentional; the second cycle changes the melody register.
    const melody = [chord[2] + 12, chord[3] + 12, chord[1] + 24, chord[2] + (Math.floor(index / 8) % 2 ? 24 : 12)];
    for (let i = 0; i < melody.length; i++) this.tone(melody[i], at + 2 + i * 3.6, 5, .085, 'sine', i % 2 ? .38 : -.38, 0, .07);
  }
  private tone(note: number, at: number, duration: number, level: number, type: OscillatorType, pan: number, detune: number, attack: number) {
    const oscillator = this.ctx.createOscillator(), envelope = this.ctx.createGain(), stereo = this.ctx.createStereoPanner();
    oscillator.type = type; oscillator.frequency.value = hz(note); oscillator.detune.value = detune; stereo.pan.value = pan;
    envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(level, at + attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, at + duration); envelope.gain.setValueAtTime(0, at + duration + .01);
    oscillator.connect(envelope); envelope.connect(stereo); stereo.connect(this.filter); this.active.add(oscillator);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); stereo.disconnect(); this.active.delete(oscillator); };
    oscillator.start(at); oscillator.stop(at + duration + .02);
  }
  snapshot() { return { title: 'Far Horizons', phrases: this.bar, voices: this.active.size, running: !!this.timer && !this.stopped }; }
  stop() {
    this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = undefined;
    for (const oscillator of this.active) { oscillator.stop(); oscillator.disconnect(); } this.active.clear();
    for (const node of [this.output, this.dry, this.filter, this.delay, this.feedback, this.reverb, this.wet]) node.disconnect();
  }
}
