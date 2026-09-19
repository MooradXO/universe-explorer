import type { Group, Camera, Box3 } from 'three';
export interface EpicOptions {
  position?: number[]; size?: number; speed?: number; color?: string; intensity?: number;
  density?: number; sound?: boolean; groundY?: number | null; maxParticles?: number;
  maxParticlesPerEmitter?: number; prewarm?: boolean; seed?: number;
}
export class EpicFX {
  group: Group; particleCount: number; finished: boolean; paused: boolean;
  update(dt: number, camera: Camera): void;
  setOptions(options: EpicOptions): void;
  restart(options?: {sound?: boolean}): void;
  seek(seconds: number, camera: Camera): void;
  bounds(): Box3;
  dispose(): void;
}
export class EpicFXLibrary {
  constructor(baseURL: string);
  ready: Promise<unknown>;
  create(id: string, options: EpicOptions): Promise<EpicFX>;
  dispose(): void;
}
