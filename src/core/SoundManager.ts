import { Vector3, type Camera } from 'three';
import { createEffectsBus, WeaponAudio, type SoundPoint, type WeaponSound } from './WeaponAudio';

export class SoundManager {
  private ctx: AudioContext | null = null;
  private effectsBus: GainNode | null = null;
  private weapons: WeaponAudio | null = null;
  private readonly audioForward = new Vector3();
  private readonly audioUp = new Vector3();
  private bgMusicStarted = false;
  private ambientStarting = false;
  private ambientStream: HTMLAudioElement | null = null;
  private ambientOscillators: OscillatorNode[] = [];
  private ambientGain: GainNode | null = null;

  private init(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.effectsBus = createEffectsBus(this.ctx!);
      this.weapons = new WeaponAudio(this.ctx!, this.effectsBus);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  public startAmbient() {
    if (this.bgMusicStarted || this.ambientStarting) return;

    const configuredStreamUrl = import.meta.env.VITE_AMBIENT_STREAM_URL?.trim();
    if (!configuredStreamUrl) {
      this.startProceduralAmbient();
      return;
    }

    this.ambientStarting = true;
    const audio = new Audio(configuredStreamUrl);
    audio.crossOrigin = 'anonymous';
    audio.volume = 0.4;
    this.ambientStream = audio;

    const useProceduralFallback = () => {
      if (this.ambientStream !== audio) return;
      audio.pause();
      this.ambientStream = null;
      this.ambientStarting = false;
      this.bgMusicStarted = false;
      this.startProceduralAmbient();
    };

    audio.addEventListener('error', useProceduralFallback, { once: true });
    void audio.play()
      .then(() => {
        this.ambientStarting = false;
        this.bgMusicStarted = true;
      })
      .catch(useProceduralFallback);
  }

  private startProceduralAmbient() {
    const ctx = this.init();
    if (this.ambientOscillators.length > 0) return;

    if (ctx.state !== 'running') {
      this.ambientStarting = true;
      void ctx.resume()
        .then(() => {
          this.ambientStarting = false;
          this.startProceduralAmbient();
        })
        .catch(() => {
          this.ambientStarting = false;
        });
      return;
    }

    this.bgMusicStarted = true;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.035, ctx.currentTime + 2.4);
    master.connect(this.effectsBus!);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, ctx.currentTime);
    filter.Q.setValueAtTime(0.7, ctx.currentTime);
    filter.connect(master);

    const voices: Array<{ frequency: number; gain: number; type: OscillatorType; detune: number }> = [
      { frequency: 55, gain: 0.55, type: 'sine', detune: -5 },
      { frequency: 82.41, gain: 0.24, type: 'sine', detune: 6 },
      { frequency: 110, gain: 0.12, type: 'triangle', detune: -12 },
    ];

    for (const voice of voices) {
      const oscillator = ctx.createOscillator();
      const voiceGain = ctx.createGain();
      oscillator.type = voice.type;
      oscillator.frequency.setValueAtTime(voice.frequency, ctx.currentTime);
      oscillator.detune.setValueAtTime(voice.detune, ctx.currentTime);
      voiceGain.gain.setValueAtTime(voice.gain, ctx.currentTime);
      oscillator.connect(voiceGain);
      voiceGain.connect(filter);
      oscillator.start();
      this.ambientOscillators.push(oscillator);
    }

    const filterLfo = ctx.createOscillator();
    const filterLfoGain = ctx.createGain();
    filterLfo.type = 'sine';
    filterLfo.frequency.setValueAtTime(0.035, ctx.currentTime);
    filterLfoGain.gain.setValueAtTime(110, ctx.currentTime);
    filterLfo.connect(filterLfoGain);
    filterLfoGain.connect(filter.frequency);
    filterLfo.start();
    this.ambientOscillators.push(filterLfo);
    this.ambientGain = master;
  }

  public stopAmbient() {
    if (this.ambientStream) {
      this.ambientStream.pause();
      this.ambientStream.removeAttribute('src');
      this.ambientStream.load();
      this.ambientStream = null;
    }
    for (const oscillator of this.ambientOscillators) {
      oscillator.stop();
      oscillator.disconnect();
    }
    this.ambientOscillators = [];
    if (this.ambientGain) {
      this.ambientGain.disconnect();
      this.ambientGain = null;
    }
    this.ambientStarting = false;
    this.bgMusicStarted = false;
  }

  public playWeapon(kind: WeaponSound, color: 'red' | 'blue' = 'red', volume = .3, position?: SoundPoint) {
    const ctx = this.init();
    if (ctx.state === 'running') this.weapons!.play(kind, color, volume, position);
  }

  public playLaser(color: 'red' | 'blue', volume = .3, position?: SoundPoint) { this.playWeapon('laser', color, volume, position); }

  public updateListener(camera: Camera) {
    if (!this.ctx) return;
    const listener = this.ctx.listener;
    this.audioForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.audioUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    // Coordinates share the same floating origin as visual projectiles and the camera.
    if (listener.positionX) {
      listener.positionX.value = camera.position.x; listener.positionY.value = camera.position.y; listener.positionZ.value = camera.position.z;
      listener.forwardX.value = this.audioForward.x; listener.forwardY.value = this.audioForward.y; listener.forwardZ.value = this.audioForward.z;
      listener.upX.value = this.audioUp.x; listener.upY.value = this.audioUp.y; listener.upZ.value = this.audioUp.z;
    } else {
      listener.setPosition(camera.position.x, camera.position.y, camera.position.z);
      listener.setOrientation(this.audioForward.x, this.audioForward.y, this.audioForward.z, this.audioUp.x, this.audioUp.y, this.audioUp.z);
    }
  }
  public shiftOrigin(delta: SoundPoint) { this.weapons?.shiftOrigin(delta); }
  public stopWeapons() { this.weapons?.stop(); }
  public snapshot() { return { state: this.ctx?.state ?? 'idle', weapons: this.weapons?.snapshot() ?? null }; }

  public playEngineStart() {
    const ctx = this.init();
    if (ctx.state !== 'running') return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(this.effectsBus!);

    const now = ctx.currentTime;
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, now);
    osc.frequency.exponentialRampToValueAtTime(450, now + 1.6);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.4);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.8);

    osc.start(now);
    osc.stop(now + 1.8);
  }
}
