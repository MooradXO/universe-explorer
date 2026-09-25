import { AmbientScore } from './AmbientScore';
import { MUSIC_EVENT, musicSettings } from './MusicSettings';
import { Vector3, type Camera } from 'three';
import { createEffectsBus, WeaponAudio, type SoundPoint, type WeaponSound } from './WeaponAudio';

export class SoundManager {
  private ctx: AudioContext | null = null;
  private effectsBus: GainNode | null = null;
  private weapons: WeaponAudio | null = null;
  private readonly audioForward = new Vector3();
  private readonly audioUp = new Vector3();
  private music: AmbientScore | null = null;

  constructor() {
    window.addEventListener(MUSIC_EVENT, () => {
      this.music?.setVolume(musicSettings.enabled ? musicSettings.volume : 0);
      if (musicSettings.enabled) this.startAmbient();
    });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend().catch(() => undefined);
      else if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
    });
  }
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
    if (!musicSettings.enabled || document.hidden) return;
    const ctx = this.init();
    if (!this.music) {
      this.music = new AmbientScore(ctx);
      this.music.setVolume(musicSettings.volume);
      this.music.start();
    }
  }

  public stopAmbient() { this.music?.stop(); this.music = null; }
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
  public snapshot() { return { state: this.ctx?.state ?? 'idle', music: { ...this.music?.snapshot(), enabled: musicSettings.enabled, volume: musicSettings.volume }, weapons: this.weapons?.snapshot() ?? null }; }

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
