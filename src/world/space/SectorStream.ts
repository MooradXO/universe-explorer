import { createSectorManifest, type SectorManifest } from './SectorManifest';
import { HOME, neighborhood, sectorKey, type Triple } from './WorldPosition';
import { SPACE_CONFIG } from './SpaceConfig';

/** Bounded interest cache; obsolete worker replies can never resurrect distant sectors. */
export class SectorStream {
  public readonly manifests = new Map<string, SectorManifest>();
  private centerKey = '';
  private desired = new Map<string, Triple>();
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  private disposed = false;
  public completed = 0;
  public discarded = 0;
  private revision = 0;
  private visibleKey = '';
  private visibleRevision = -1;
  private visibleManifests: SectorManifest[] = [];

  constructor(private readonly generate: (sector: Triple) => Promise<SectorManifest>) {
    // A small immutable home descriptor is immediately available to start/auth fixtures.
    this.manifests.set('0,0,0', createSectorManifest(HOME));
  }

  update(center: Triple): void {
    const key = sectorKey(center);
    if (key !== this.centerKey) {
      this.centerKey = key;
      this.desired = new Map(neighborhood(center, SPACE_CONFIG.manifestRadius).map((cell) => [sectorKey(cell), cell]));
      for (const cached of this.manifests.keys()) if (!this.desired.has(cached)) this.manifests.delete(cached);
      this.revision++;
      this.failed.clear();
    }
    this.pump();
  }

  private pump(): void {
    if (this.disposed) return;
    for (const [key, cell] of this.desired) {
      if (this.pending.size >= SPACE_CONFIG.manifestConcurrency) break;
      if (this.manifests.has(key) || this.pending.has(key) || this.failed.has(key)) continue;
      this.pending.add(key);
      void this.generate(cell).then((manifest) => {
        if (this.disposed) return;
        if (this.desired.has(key)) { this.manifests.set(key, manifest); this.completed += 1; this.revision++; }
        else this.discarded += 1;
      }, () => { if (!this.disposed && this.desired.has(key)) this.failed.add(key); }).finally(() => {
        this.pending.delete(key);
        this.pump();
      });
    }
  }

  visible(center: Triple): SectorManifest[] {
    const key = sectorKey(center);
    if (this.visibleKey === key && this.visibleRevision === this.revision) return this.visibleManifests;
    this.visibleKey = key; this.visibleRevision = this.revision;
    this.visibleManifests = neighborhood(center, SPACE_CONFIG.navigationRadius).flatMap((cell) => {
      const manifest = this.manifests.get(sectorKey(cell));
      return manifest ? [manifest] : [];
    });
    return this.visibleManifests;
  }

  snapshot() {
    return { sector: this.centerKey, cached: this.manifests.size, pending: this.pending.size,
      queued: [...this.desired.keys()].filter((key) => !this.manifests.has(key) && !this.pending.has(key) && !this.failed.has(key)).length,
      failed: this.failed.size, completed: this.completed, discarded: this.discarded };
  }

  dispose(): void { this.disposed = true; this.manifests.clear(); this.desired.clear(); this.visibleManifests = []; this.revision++; }
}
