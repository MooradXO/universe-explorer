export const NET = Object.freeze({ version: 3, roomId: 'universe-v1', maxPlayers: 100, tickHz: 50, snapshotHz: 10,
  interestRadius: 16000, interestExitRadius: 18000, reconnectSeconds: 20, maxInputQueue: 15, inputTimeoutMs: 300 });
export type Weapon = 'laser' | 'shotgun' | 'missile';
export type Stunt = 'uturn' | 'rollLeft' | 'rollRight' | null;
export interface PilotInput { seq: number; x: number; y: number; z: number; yaw: number; pitch: number; roll: number; boost: boolean; stunt: Stunt; }
export const idleInput = (seq = 0): PilotInput => ({ seq, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, boost: false, stunt: null });
export interface FlightSnapshot {
  p: number[]; q: number[]; v: number[]; a: number[]; boost: number; exhausted: boolean; boosting: boolean;
  stunt: Stunt; stuntTime: number; engines: number;
}
export interface SelfSnapshot {
  id: string; seq: number; epoch: number; systemId: string; flight: FlightSnapshot;
  hp: number; shield: number; maxHP: number; subsystems: { engines: number; weapons: number; shieldGenerator: number };
  dead: boolean; bounty: number; warp: string | null; cruise: string | null; travelStatus: string;
}
export interface EntitySnapshot { id: string; name: string; p: number[]; q: number[]; bounty: number; hp: number; dead: boolean; }
export interface ShotSnapshot { id: number; owner: string; p: number[]; v: number[]; life: number; weapon: Weapon; color: string; }
export interface WorldSnapshot { tick: number; self: SelfSnapshot; entities: EntitySnapshot[]; gone: string[]; shots: ShotSnapshot[]; shotGone: number[]; }
export interface TravelArrival { systemId: string; epoch: number; object: import('../../catalog/StarMapData').MapObject; position: number[]; respawn: boolean; }
export function validInput(value: unknown): value is PilotInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as PilotInput;
  return Number.isSafeInteger(v.seq) && v.seq > 0 && v.seq < 2 ** 31 &&
    [v.x, v.y, v.z, v.yaw, v.pitch, v.roll].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1) &&
    typeof v.boost === 'boolean' && [null, 'uturn', 'rollLeft', 'rollRight'].includes(v.stunt);
}
