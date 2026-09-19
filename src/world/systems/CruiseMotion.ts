import type { Triple } from '../space/WorldPosition';
import { SYSTEM_CONFIG } from './SystemConfig';

export interface FlightObstacle { position: Triple; radius: number; margin?:number; speedLimit?:boolean; }
const distance = (a: Triple, b: Triple) => Math.hypot(...a.map((v, i) => v - b[i]));

/** Swept motion: even a long frame cannot cross a planet or star. */
export function cruiseStep(position: Triple, target: Triple, obstacles: readonly FlightObstacle[], dt: number) {
  const remaining = distance(position, target);
  if (remaining < 100) return { position: target, speed: 0, state: 'arrived' as const };
  const direction = target.map((v, i) => (v - position[i]) / remaining);
  let clearance = Infinity;
  for (const body of obstacles) if(body.speedLimit!==false)clearance = Math.min(clearance, distance(position, body.position) - body.radius - (body.margin??SYSTEM_CONFIG.cruiseMargin));
  if (clearance <= 0) return { position, speed: 0, state: 'obstructed' as const };
  const speed = Math.min(SYSTEM_CONFIG.cruiseMaxSpeed, Math.max(550, Math.min(clearance, remaining) / SYSTEM_CONFIG.cruiseResponseSeconds));
  const step = Math.min(remaining, speed * Math.max(0, Math.min(0.1, dt)));
  for (const body of obstacles) {
    const offset = body.position.map((v, i) => v - position[i]);
    const along = Math.max(0, Math.min(step, offset.reduce((sum, v, i) => sum + v * direction[i], 0)));
    const separation = Math.hypot(...offset.map((v, i) => v - direction[i] * along));
    if (separation <= body.radius + (body.margin??SYSTEM_CONFIG.cruiseMargin)) return { position, speed: 0, state: 'obstructed' as const };
  }
  return { position: position.map((v, i) => v + direction[i] * step) as unknown as Triple, speed, state: 'moving' as const };
}
