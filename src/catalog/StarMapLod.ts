import type { StarTileNode } from './StarMapData';

/** A cut contains either a parent or its descendants, never both. */
export function selectStarTiles(root: string, nodes: ReadonlyMap<string, StarTileNode>,
  score: (node: StarTileNode) => number, visible: (node: StarTileNode) => boolean,
  maxTiles: number, maxPoints: number): string[] {
  const selected = new Map<string, StarTileNode>([[root, nodes.get(root)!]]);
  let points = nodes.get(root)!.points;
  const blocked = new Set<string>();
  for (let step = 0; step < nodes.size; step++) {
    const candidates = [...selected.values()].filter(node => node.children.length && !blocked.has(node.key))
      .map(node => ({ node, priority: score(node) })).filter(value => value.priority > 1)
      .sort((a, b) => b.priority - a.priority || a.node.key.localeCompare(b.node.key));
    const candidate = candidates[0]?.node;
    if (!candidate) break;
    const children = candidate.children.map(key => nodes.get(key)!).filter(visible);
    const nextPoints = points - candidate.points + children.reduce((sum, node) => sum + node.points, 0);
    if (!children.length || selected.size - 1 + children.length > maxTiles || nextPoints > maxPoints) {
      blocked.add(candidate.key); continue;
    }
    selected.delete(candidate.key);
    children.forEach(node => selected.set(node.key, node));
    points = nextPoints;
  }
  return [...selected.keys()];
}

/** Bounded loads, atomic cut replacement, and LRU eviction of unneeded tiles. */
export class StarTileCache<T> {
  readonly entries = new Map<string, T>();
  active: string[] = [];
  desired: string[] = [];
  errors = 0;
  private jobs = new Map<string, AbortController>();
  private failed = new Set<string>();
  private closed = false;
  constructor(private maxEntries: number, private load: (key: string, signal: AbortSignal) => Promise<T>,
    private dispose: (entry: T) => void) {}
  get pending() { return this.jobs.size; }
  setDesired(keys: string[]) {
    if (this.closed) return;
    this.desired = keys;
    const wanted = new Set(keys);
    for (const [key, controller] of this.jobs) if (!wanted.has(key)) controller.abort();
    this.pump();
  }
  retry() { this.failed.clear(); this.errors = 0; this.pump(); }
  private pump() {
    if (this.closed) return;
    if (this.desired.length && this.desired.every(key => this.entries.has(key))) this.active = [...this.desired];
    const protectedKeys = new Set([...this.active, ...this.desired]);
    for (const key of protectedKeys) {
      const value = this.entries.get(key);
      if (value) { this.entries.delete(key); this.entries.set(key, value); }
    }
    for (const [key, value] of this.entries) {
      if (this.entries.size <= this.maxEntries) break;
      if (!protectedKeys.has(key)) { this.dispose(value); this.entries.delete(key); }
    }
    for (const key of this.desired) {
      if (this.jobs.size >= 2) break;
      if (this.entries.has(key) || this.jobs.has(key) || this.failed.has(key)) continue;
      const controller = new AbortController();
      this.jobs.set(key, controller);
      void this.load(key, controller.signal).then(value => {
        if (this.closed || controller.signal.aborted) this.dispose(value);
        else this.entries.set(key, value);
      }).catch(error => {
        if (!controller.signal.aborted && !this.closed) { this.errors++; this.failed.add(key); console.warn('Star tile unavailable', error.message); }
      }).finally(() => { this.jobs.delete(key); this.pump(); });
    }
  }
  close() {
    this.closed = true;
    this.jobs.forEach(controller => controller.abort());
    this.entries.forEach(this.dispose);
    this.entries.clear(); this.active = []; this.desired = [];
  }
}
