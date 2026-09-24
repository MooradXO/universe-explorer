import { Quaternion, Vector3 } from 'three';
import type { Entity, Pilot } from './Simulation';
import type { SystemDescriptor } from '../src/world/systems/SystemDescriptor';

interface Bot extends Entity {
  bomber: boolean; squad: number; velocity: Vector3; wander: Vector3; cooldown: number;
  chase: boolean; evade: number; evadeDirection: Vector3;
}
/** Existing interceptor/bomber rules, run once on the server, targeting the nearest living pilot. */
export class ServerBots {
  readonly entities = new Map<string, Bot>();
  private center = new Vector3(); private time = 0; private generation = 0;
  constructor(private shoot: (id: string, position: Vector3, velocity: Vector3, bomber: boolean) => void) {}
  clear() { this.entities.clear(); }
  remove(id: string) { this.entities.delete(id); }
  hit(id: string, hp: number) { const bot = this.entities.get(id); if (bot) { bot.hp = hp; bot.evade = 1.2; bot.evadeDirection.set(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize(); } }
  spawn(count: number, center: Vector3) {
    this.clear(); this.center.copy(center); this.generation++;
    for (let i = 0; i < count; i++) {
      const bomber = Math.random() < .2, squad = Math.floor(i / 5), id = `bot_${this.generation}_${i}`;
      this.entities.set(id, { id, bomber, squad, name: `${bomber ? 'Bomber' : 'Interceptor'} Squadron [${squad}] - Bot ${i}`,
        position: this.wander(), quaternion: new Quaternion(), hp: bomber ? 300 : 100, bounty: bomber ? 350 : 100,
        dead: false, velocity: new Vector3(), wander: this.wander(), cooldown: Math.random() * 2, chase: false, evade: 0, evadeDirection: new Vector3() });
    }
  }
  private wander() { return new Vector3((Math.random() - .5) * 30000, (Math.random() - .5) * 4000, (Math.random() - .5) * 30000).add(this.center); }
  update(dt: number, pilots: Pilot[], system: SystemDescriptor) {
    this.time += dt;
    const squads = new Map<number, Bot[]>();
    for (const bot of this.entities.values()) { const list = squads.get(bot.squad) ?? []; list.push(bot); squads.set(bot.squad, list); }
    for (const bot of this.entities.values()) {
      let target: Pilot | undefined, distance = Infinity;
      for (const pilot of pilots) { const d = pilot.position.distanceToSquared(bot.position); if (d < distance) { target = pilot; distance = d; } }
      bot.cooldown -= dt; bot.evade = Math.max(0, bot.evade - dt);
      const steer = new Vector3();
      if (bot.evade > 0) steer.addScaledVector(bot.evadeDirection, 650);
      else {
        if (bot.chase && distance > 8000 ** 2) bot.chase = false;
        if (!bot.chase && distance < (bot.bomber ? 7000 : 5000) ** 2) bot.chase = true;
        if (bot.chase && target) {
          if (!bot.bomber) {
            const aim = target.position.clone().addScaledVector(target.model.velocity, .5);
            aim.x += Math.sin(this.time * 3 + bot.squad) * 150; aim.y += Math.cos(this.time * 3) * 50;
            steer.add(aim.sub(bot.position).normalize().multiplyScalar(650));
          } else if (distance > 4000 ** 2) steer.add(target.position.clone().sub(bot.position).normalize().multiplyScalar(400));
          else if (distance < 2000 ** 2) steer.add(bot.position.clone().sub(target.position).normalize().multiplyScalar(500));
          if (distance < (bot.bomber ? 5000 : 3500) ** 2 && bot.cooldown <= 0) {
            bot.cooldown = bot.bomber ? 1.5 + Math.random() : .65 + Math.random() * .5;
            const dir = target.position.clone().sub(bot.position).normalize(), spread = bot.bomber ? .02 : .04;
            dir.add(new Vector3((Math.random() - .5) * spread, (Math.random() - .5) * spread, (Math.random() - .5) * spread)).normalize();
            this.shoot(bot.id, bot.position, dir.multiplyScalar(bot.bomber ? 2200 : 3200).add(bot.velocity), bot.bomber);
          }
        } else {
          if (Math.random() < .005 || bot.position.distanceToSquared(bot.wander) < 500 ** 2) bot.wander = this.wander();
          steer.add(bot.wander.clone().sub(bot.position).normalize().multiplyScalar(200));
        }
        const cohesion = new Vector3(), alignment = new Vector3(), separation = new Vector3(); let count = 0;
        for (const mate of squads.get(bot.squad)!) {
          if (mate === bot) continue; const d = mate.position.distanceTo(bot.position);
          if (d < 2500) { cohesion.add(mate.position); alignment.add(mate.velocity); count++; }
          if (d < 450) separation.add(bot.position.clone().sub(mate.position).normalize().divideScalar(Math.max(.01, d)));
        }
        if (count) { steer.add(cohesion.divideScalar(count).sub(bot.position).normalize().multiplyScalar(80)); steer.add(alignment.normalize().multiplyScalar(60)); }
        if (separation.lengthSq() > .0001) steer.add(separation.normalize().multiplyScalar(150));
      }
      for (const body of system.bodies) {
        const offset = bot.position.clone().sub(new Vector3().fromArray(body.position)), distance = offset.length(), danger = body.radius + 600;
        if (distance < danger) steer.add(offset.normalize().multiplyScalar(400 * danger / (distance + 1)));
      }
      if (bot.position.distanceTo(this.center) > 25000) steer.add(this.center.clone().sub(bot.position).normalize().multiplyScalar(300));
      bot.velocity.addScaledVector(steer, dt * 2).clampLength(0, bot.bomber ? 350 : 550).multiplyScalar(Math.pow(.97, dt * 60));
      bot.position.addScaledVector(bot.velocity, dt);
      if (bot.velocity.lengthSq() > .01) {
        const dir = bot.chase && target ? target.position.clone().sub(bot.position).normalize() : bot.velocity.clone().normalize();
        bot.quaternion.slerp(new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), dir), dt * 4.5);
      }
    }
  }
}
