import { Vector3 } from 'three';
import { cruiseStep, type FlightObstacle } from './CruiseMotion';
import { SYSTEM_CONFIG } from './SystemConfig';
import type { Triple } from '../space/WorldPosition';
import { bodyArrival, type SystemDescriptor } from './SystemDescriptor';

const radius = (body: FlightObstacle) => body.radius + (body.margin ?? SYSTEM_CONFIG.cruiseMargin);
const distance = (a: Triple, b: Triple) => Math.hypot(...a.map((v, i) => v - b[i]));

/** Rejoin the established clear interplanetary corridor after manual orbital flight. */
export function cruiseDeparture(position: Triple, target: Triple, system: SystemDescriptor): Triple | undefined {
  const nearest = system.bodies.map(bodyArrival).sort((a, b) => distance(position, a) - distance(position, b))[0];
  if (!nearest || distance(nearest, target) < 1000) return undefined;
  const away = distance(position, nearest);
  return away > 600 && away < SYSTEM_CONFIG.renderDistance ? nearest : undefined;
}

/** Entry distance along a segment, including its endpoints. */
function intersection(start: Triple, end: Triple, body: FlightObstacle): number | null {
  const length = distance(start, end), r = radius(body);
  const offset = body.position.map((v, i) => v - start[i]);
  if (Math.hypot(...offset) <= r) return 0;
  if (length < 1e-8) return null;
  const direction = end.map((v, i) => (v - start[i]) / length);
  const along = offset.reduce((sum, v, i) => sum + v * direction[i], 0);
  const closest = Math.max(0, Math.min(length, along));
  const separation = Math.hypot(...offset.map((v, i) => v - direction[i] * closest));
  if (separation > r) return null;
  const perpendicularSq = Math.max(0, offset.reduce((sum, v) => sum + v * v, 0) - along * along);
  return Math.max(0, along - Math.sqrt(Math.max(0, r * r - perpendicularSq)));
}

/** Small deterministic visibility graph around one safety sphere. No world edits. */
function detour(start: Triple, target: Triple, body: FlightObstacle): Triple[] | null {
  const r = radius(body);
  if (distance(start, body.position) <= r || distance(target, body.position) <= r) return null;
  const center = new Vector3().fromArray(body.position);
  const radial = new Vector3().fromArray(start).sub(center).normalize();
  const tangent = new Vector3().fromArray(target).sub(center);
  tangent.addScaledVector(radial, -tangent.dot(radial));
  if (tangent.lengthSq() < 1e-6) {
    tangent.set(Math.abs(radial.y) < .9 ? 0 : 1, Math.abs(radial.y) < .9 ? 1 : 0, 0);
    tangent.addScaledVector(radial, -tangent.dot(radial));
  }
  tangent.normalize();
  const shell = r + Math.max(400, r * .2), nodes: Triple[] = [start];
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    nodes.push(center.clone().addScaledVector(radial, Math.cos(angle) * shell)
      .addScaledVector(tangent, Math.sin(angle) * shell).toArray());
  }
  nodes.push(target);
  const cost = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  cost[0] = 0;
  for (let count = 0; count < nodes.length; count++) {
    let best = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && Number.isFinite(cost[i]) && (best < 0 || cost[i] < cost[best])) best = i;
    if (best < 0) return null;
    if (best === nodes.length - 1) {
      const path: Triple[] = [];
      for (let node = previous[best]; node > 0; node = previous[node]) path.unshift(nodes[node]);
      return path;
    }
    visited.add(best);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i) || intersection(nodes[best], nodes[i], body) !== null) continue;
      const next = cost[best] + distance(nodes[best], nodes[i]);
      if (next < cost[i]) { cost[i] = next; previous[i] = best; }
    }
  }
  return null;
}

/** Retains safe waypoints across ticks; the original swept check still validates every move. */
export class CruiseNavigator {
  private waypoints: Triple[] = [];
  reset(departure?: Triple) { this.waypoints = departure ? [departure] : []; }
  step(position: Triple, target: Triple, obstacles: readonly FlightObstacle[], dt: number) {
    // Manual flight and saved positions may be inside a safety margin without
    // being inside the planet. Leave that margin radially, never through matter.
    const enclosing = obstacles.filter(body => distance(position, body.position) <= radius(body));
    if (enclosing.length) {
      const body = enclosing[0], radial = position.map((v, i) => v - body.position[i]);
      const length = Math.hypot(...radial);
      if (enclosing.some(item => distance(position, item.position) <= item.radius)
        || enclosing.some(item => radial.reduce((sum, v, i) => sum + v * (position[i] - item.position[i]), 0) < 0)) {
        return { position, speed: 0, state: 'obstructed' as const, heading: target, avoiding: false };
      }
      const heading = radial.map((v, i) => body.position[i] + v / length * (radius(body) + 600)) as unknown as Triple;
      const previous = this.waypoints[0];
      if (!previous || distance(previous, heading) > 1) this.waypoints.unshift(heading);
      const step = cruiseStep(position, heading, obstacles.map(item => enclosing.includes(item) ? { ...item, margin: 0 } : item), dt);
      return { ...step, heading, avoiding: true };
    }
    while (this.waypoints.length && distance(position, this.waypoints[0]) < 100) this.waypoints.shift();
    let heading = this.waypoints[0] ?? target;
    let step = cruiseStep(position, heading, obstacles, dt);
    // Most ticks are already on the clear corridor. Plan only when the existing
    // swept check finds a blocked move, avoiding a second all-obstacle scan at 50 Hz.
    for (let attempt = 0; attempt < 4; attempt++) {
      if (step.state !== 'obstructed') break;
      let blocked: FlightObstacle | undefined, entry = Infinity;
      for (const body of obstacles) {
        const hit = intersection(position, heading, body);
        if (hit !== null && hit < entry) { entry = hit; blocked = body; }
      }
      if (!blocked) break;
      const bypass = detour(position, heading, blocked);
      if (!bypass?.length || bypass.length + this.waypoints.length > 32) {
        return { position, speed: 0, state: 'obstructed' as const, heading, avoiding: false };
      }
      this.waypoints.unshift(...bypass); heading = this.waypoints[0];
      step = cruiseStep(position, heading, obstacles, dt);
    }
    const avoiding = this.waypoints.length > 0;
    // Consume a waypoint only after the caller has actually reached it. A caller
    // may hold position while smoothly aligning the ship with this heading.
    return { ...step, state: step.state === 'arrived' && avoiding ? 'moving' as const : step.state, heading, avoiding };
  }
}
