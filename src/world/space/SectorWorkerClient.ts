import type { SectorManifest } from './SectorManifest';
import type { Triple } from './WorldPosition';
import { WORLD_SEED } from '../celestial/WorldSeed';

export class SectorWorkerClient {
  private readonly worker = new Worker(new URL('./SectorWorker.ts', import.meta.url), { type: 'module' });
  private nextId = 0;
  private failure: Error | null = null;
  private readonly pending = new Map<number, { resolve: (value: SectorManifest) => void; reject: (error: Error) => void }>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<{ id: number; manifest: SectorManifest; error?: string }>) => {
      const request = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      if (event.data.error) request?.reject(new Error(event.data.error));
      else request?.resolve(event.data.manifest);
    };
    this.worker.onerror = () => {
      this.failure = new Error('Sector worker unavailable');
      for (const request of this.pending.values()) request.reject(this.failure);
      this.pending.clear();
    };
  }

  generate = (sector: Triple): Promise<SectorManifest> => {
    if (this.failure) return Promise.reject(this.failure);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, sector, seed: WORLD_SEED });
    });
  };

  dispose(): void {
    this.worker.terminate();
    this.failure = new Error('Sector worker disposed');
    for (const request of this.pending.values()) request.reject(this.failure);
    this.pending.clear();
  }
}
