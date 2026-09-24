import type { EntitySnapshot, ShotSnapshot, WorldSnapshot } from './Protocol';

type Identity = [number, string, string, number, number, boolean];
export interface PackedWorld {
  tick: number; self: WorldSnapshot['self']; identities: Identity[];
  entities: Uint8Array; gone: number[]; shots: Uint8Array; shotGone: number[]; forget: number[];
}
const weapons = ['laser', 'shotgun', 'missile'] as const;
const colors = ['red', 'blue', 'purple', 'green', 'yellow'] as const;
const ENTITY_BYTES = 24, SHOT_BYTES = 36;
const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
/** Integer positions retain 0.1 game-unit precision; orientations retain 1/32767.
 * Short per-connection IDs and change-only metadata avoid repeating UUIDs/names in every state.
 */
export class WorldEncoder {
  private next = 1;
  private identities = new Map<string, Identity>();
  private entities = new Set<string>();
  private shots = new Map<number, string>();
  private owners = new Map<string, number>();
  encode(world: WorldSnapshot): PackedWorld {
    const identities: Identity[] = [];
    const identify = (id: string, entity?: EntitySnapshot) => {
      let info = this.identities.get(id);
      if (!info) { info = [this.next++, id, entity?.name ?? '', entity?.bounty ?? 0, entity?.hp ?? 0, entity?.dead ?? false]; this.identities.set(id, info); identities.push([...info]); }
      else if (entity && (info[2] !== entity.name || info[3] !== entity.bounty || info[4] !== entity.hp || info[5] !== entity.dead)) {
        info[2] = entity.name; info[3] = entity.bounty; info[4] = entity.hp; info[5] = entity.dead; identities.push([...info]);
      }
      return info[0];
    };
    const origin = world.self.flight.p;
    const entities = new Uint8Array(world.entities.length * ENTITY_BYTES), entityView = viewOf(entities);
    world.entities.forEach((e, i) => {
      this.entities.add(e.id);
      const at = i * ENTITY_BYTES; entityView.setUint32(at, identify(e.id, e), true);
      for (let axis = 0; axis < 3; axis++) entityView.setInt32(at + 4 + axis * 4, Math.round((e.p[axis] - origin[axis]) * 10), true);
      for (let axis = 0; axis < 4; axis++) entityView.setInt16(at + 16 + axis * 2, Math.round(e.q[axis] * 32767), true);
    });
    const gone = world.gone.map(id => { this.entities.delete(id); return this.identities.get(id)?.[0] ?? 0; });
    const shots = new Uint8Array(world.shots.length * SHOT_BYTES), shotView = viewOf(shots);
    world.shots.forEach((s, i) => {
      if (!this.shots.has(s.id)) { this.shots.set(s.id, s.owner); this.owners.set(s.owner, (this.owners.get(s.owner) ?? 0) + 1); }
      const at = i * SHOT_BYTES; shotView.setUint32(at, s.id, true); shotView.setUint32(at + 4, identify(s.owner), true);
      for (let axis = 0; axis < 3; axis++) {
        shotView.setInt32(at + 8 + axis * 4, Math.round((s.p[axis] - origin[axis]) * 10), true);
        shotView.setFloat32(at + 20 + axis * 4, s.v[axis], true);
      }
      shotView.setUint16(at + 32, Math.ceil(s.life * 1000), true); shotView.setUint8(at + 34, weapons.indexOf(s.weapon));
      shotView.setUint8(at + 35, Math.max(0, colors.indexOf(s.color as typeof colors[number])));
    });
    for (const id of world.shotGone) {
      const owner = this.shots.get(id); if (owner) {
        const remaining = this.owners.get(owner)! - 1; if (remaining) this.owners.set(owner, remaining); else this.owners.delete(owner);
      }
      this.shots.delete(id);
    }
    const forget: number[] = [];
    for (const [id, value] of this.identities) if (!this.entities.has(id) && !this.owners.has(id)) { forget.push(value[0]); this.identities.delete(id); }
    return { tick: world.tick, self: world.self, identities, entities, gone, shots, shotGone: world.shotGone, forget };
  }
}

export class WorldDecoder {
  private identities = new Map<number, Identity>();
  reset() { this.identities.clear(); }
  decode(world: PackedWorld): WorldSnapshot {
    for (const info of world.identities) this.identities.set(info[0], info);
    if (world.entities.byteLength % ENTITY_BYTES || world.shots.byteLength % SHOT_BYTES) throw new Error('Malformed world snapshot');
    const origin = world.self.flight.p, entityView = viewOf(world.entities), shotView = viewOf(world.shots);
    const entities: EntitySnapshot[] = [], shots: ShotSnapshot[] = [];
    for (let at = 0; at < world.entities.byteLength; at += ENTITY_BYTES) {
      const info = this.identities.get(entityView.getUint32(at, true)); if (!info) throw new Error('Missing network entity identity');
      const p: number[] = [], q: number[] = [];
      for (let axis = 0; axis < 3; axis++) p.push(origin[axis] + entityView.getInt32(at + 4 + axis * 4, true) / 10);
      for (let axis = 0; axis < 4; axis++) q.push(entityView.getInt16(at + 16 + axis * 2, true) / 32767);
      entities.push({ id: info[1], name: info[2], bounty: info[3], hp: info[4], dead: info[5], p, q });
    }
    for (let at = 0; at < world.shots.byteLength; at += SHOT_BYTES) {
      const info = this.identities.get(shotView.getUint32(at + 4, true)); if (!info) throw new Error('Missing projectile owner identity');
      const p: number[] = [], v: number[] = [];
      for (let axis = 0; axis < 3; axis++) { p.push(origin[axis] + shotView.getInt32(at + 8 + axis * 4, true) / 10); v.push(shotView.getFloat32(at + 20 + axis * 4, true)); }
      shots.push({ id: shotView.getUint32(at, true), owner: info[1], p, v, life: shotView.getUint16(at + 32, true) / 1000,
        weapon: weapons[shotView.getUint8(at + 34)], color: colors[shotView.getUint8(at + 35)] });
    }
    const gone = world.gone.map(index => this.identities.get(index)?.[1]).filter((id): id is string => !!id);
    for (const index of world.forget) this.identities.delete(index);
    return { tick: world.tick, self: world.self, entities, gone, shots, shotGone: world.shotGone };
  }
}
