/** Original procedural effects. No sampled recordings or third-party audio assets. */
export type WeaponSound = 'laser' | 'shotgun' | 'missile' | 'impact';
export type SoundPoint = { x: number; y: number; z: number };
export const WEAPON_VOICE_LIMIT = 16;

export function weaponPCM(kind: WeaponSound, color: 'red' | 'blue', sampleRate: number, variant = 0): Float32Array<ArrayBuffer> {
  const duration = kind === 'missile' ? .86 : kind === 'impact' ? .55 : kind === 'shotgun' ? .38 : .32;
  const data = new Float32Array(Math.ceil(duration * sampleRate));
  let seed = 0x51a83 + variant * 7919, low = 0, previous = 0, dc = 0, peak = 0;
  const pitch = (color === 'blue' ? 1.24 : 1) * (kind === 'shotgun' ? .82 : 1) * (1 + (variant - 1) * .022);
  const noise = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 2147483648 - 1; };
  const wire = (t: number, pitch: number) => {
    if (t < 0) return 0;
    // Dispersive metal-like chirps, with inharmonic modes and a lower resonant body.
    const phase = 2 * Math.PI * pitch * (155 * t + 2250 * .021 * (1 - Math.exp(-t / .021)));
    return (.56 * Math.sin(phase) + .27 * Math.sin(phase * 1.413 + .7) * Math.exp(-t * 16)
      + .14 * Math.sin(phase * 2.117 + 1.2) * Math.exp(-t * 32)) * Math.exp(-t * 17);
  };
  for (let i = 0; i < data.length; i++) {
    const t = i / sampleRate, n = noise(); low += .1 * (n - low);
    let value: number;
    if (kind === 'missile' || kind === 'impact') {
      const impact = kind === 'impact';
      const thump = Math.sin(2 * Math.PI * (47 * t + 105 * .026 * (1 - Math.exp(-t / .026)))) * Math.exp(-t * 17);
      const ignition = (n - low) * Math.exp(-t * 65) * .2;
      const motor = (low * 2.9 + n * .14) * (impact ? Math.exp(-t * 9) : (1 - Math.exp(-t * 45)) * Math.exp(-t * 5.5));
      value = .72 * thump + ignition + motor;
    } else {
      value = wire(t, pitch) + .22 * wire(t - .031, pitch * .94) + .10 * wire(t - .067, pitch * 1.06);
      value += .22 * (n - low) * Math.exp(-t * 130);
      value += .2 * Math.sin(2 * Math.PI * (78 * t + 75 * .03 * (1 - Math.exp(-t / .03)))) * Math.exp(-t * 25);
      if (kind === 'shotgun') value = .7 * value + .38 * wire(t - .007, pitch * .76) + .28 * wire(t - .014, pitch * 1.09);
    }
    const attack = Math.min(1, t / .0015), release = Math.min(1, (duration - t) / .035);
    const driven = Math.tanh(value * 1.5);
    // DC blocker before the final envelope, retaining silence at both endpoints.
    dc = driven - previous + Math.exp(-2 * Math.PI * 30 / sampleRate) * dc; previous = driven;
    data[i] = dc * attack * release; peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < data.length; i++) data[i] *= .86 / Math.max(.01, peak);
  data[0] = 0; data[data.length - 1] = 0;
  return data;
}

/** A shared effects bus keeps simultaneous weapons bounded before the device output. */
export function createEffectsBus(ctx: BaseAudioContext, destination: AudioNode = ctx.destination) {
  const input = ctx.createGain(), compressor = ctx.createDynamicsCompressor(), ceiling = ctx.createWaveShaper();
  input.gain.value = .82;
  compressor.threshold.value = -12; compressor.knee.value = 12; compressor.ratio.value = 8;
  compressor.attack.value = .003; compressor.release.value = .12;
  const curve = new Float32Array(4097);
  for (let i = 0; i < curve.length; i++) {
    const x = i * 2 / (curve.length - 1) - 1, a = Math.abs(x);
    curve[i] = Math.sign(x) * (a <= .7 ? a : .7 + .2 * Math.tanh((a - .7) / .2));
  }
  ceiling.curve = curve; ceiling.oversample = '2x';
  input.connect(compressor); compressor.connect(ceiling); ceiling.connect(destination);
  return input;
}

type Voice = { source: AudioBufferSourceNode; gain: GainNode; panner: PannerNode | null; position: SoundPoint | null; end: number };
export class WeaponAudio {
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<Voice>();
  private serial = 0;
  private played: Record<WeaponSound, number> = { laser: 0, shotgun: 0, missile: 0, impact: 0 };
  private dropped = 0;
  constructor(private ctx: BaseAudioContext, private output: AudioNode) {}

  play(kind: WeaponSound, color: 'red' | 'blue' = 'red', volume = .3, position?: SoundPoint, when = this.ctx.currentTime) {
    // Four slots remain available for the player's weapons during distant firefights.
    const remote = [...this.voices].filter(v => v.position).length;
    if (this.voices.size >= WEAPON_VOICE_LIMIT || (position && remote >= 12)) { this.dropped++; return false; }
    const variant = this.serial++ % 3, key = `${kind}/${kind === 'missile' || kind === 'impact' ? 'red' : color}/${variant}`;
    let buffer = this.buffers.get(key);
    if (!buffer) {
      const pcm = weaponPCM(kind, color, this.ctx.sampleRate, variant);
      buffer = this.ctx.createBuffer(1, pcm.length, this.ctx.sampleRate); buffer.copyToChannel(pcm, 0); this.buffers.set(key, buffer);
    }
    const source = this.ctx.createBufferSource(), gain = this.ctx.createGain(); source.buffer = buffer;
    gain.gain.value = Math.min(.65, Math.max(0, volume)) * (kind === 'missile' ? 1.15 : 1);
    source.connect(gain);
    const panner = position ? this.ctx.createPanner() : null;
    if (panner && position) {
      panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = 450;
      panner.maxDistance = 8000; panner.rolloffFactor = 1.4;
      panner.positionX.value = position.x; panner.positionY.value = position.y; panner.positionZ.value = position.z;
      gain.connect(panner); panner.connect(this.output);
    } else gain.connect(this.output);
    const voice: Voice = { source, gain, panner, position: position ? { ...position } : null, end: when + buffer.duration };
    this.voices.add(voice); this.played[kind]++;
    source.onended = () => { source.disconnect(); gain.disconnect(); panner?.disconnect(); this.voices.delete(voice); };
    source.start(when); return true;
  }

  shiftOrigin(delta: SoundPoint) {
    for (const voice of this.voices) if (voice.position && voice.panner) {
      voice.position.x -= delta.x; voice.position.y -= delta.y; voice.position.z -= delta.z;
      voice.panner.positionX.value = voice.position.x; voice.panner.positionY.value = voice.position.y; voice.panner.positionZ.value = voice.position.z;
    }
  }
  stop() { for (const voice of this.voices) { voice.source.stop(); voice.source.disconnect(); voice.gain.disconnect(); voice.panner?.disconnect(); } this.voices.clear(); }
  snapshot() { return { active: this.voices.size, spatial: [...this.voices].filter(v => v.panner).length, buffers: this.buffers.size, played: { ...this.played }, dropped: this.dropped }; }
}
