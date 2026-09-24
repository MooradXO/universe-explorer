import { Vector3 } from 'three';

/** Rebuilt once per tick; queries visit nearby cells, never the whole star catalogue. */
export class SpatialIndex<T extends { position: Vector3 }> {
  private cells = new Map<string, T[]>();
  constructor(private size = 4000) {}
  clear() { this.cells.clear(); }
  add(item: T) {
    const p = item.position, key = `${Math.floor(p.x / this.size)},${Math.floor(p.y / this.size)},${Math.floor(p.z / this.size)}`;
    const cell = this.cells.get(key); if (cell) cell.push(item); else this.cells.set(key, [item]);
  }
  nearby(p: Vector3, radius: number): T[] {
    const result: T[] = [], s = this.size;
    for (let x = Math.floor((p.x - radius) / s); x <= Math.floor((p.x + radius) / s); x++)
      for (let y = Math.floor((p.y - radius) / s); y <= Math.floor((p.y + radius) / s); y++)
        for (let z = Math.floor((p.z - radius) / s); z <= Math.floor((p.z + radius) / s); z++) {
          const cell = this.cells.get(`${x},${y},${z}`); if (cell) for (const item of cell)
            if (item.position.distanceToSquared(p) <= radius * radius) result.push(item);
        }
    return result;
  }
}
