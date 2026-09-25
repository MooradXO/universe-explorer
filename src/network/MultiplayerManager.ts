import { isSupabaseConfigured, supabase } from '../lib/supabase';
import * as THREE from 'three';
import { Settings } from '../core/Settings';
import { RealtimeMetrics } from './RealtimeMetrics';
import type { FloatingOrigin } from '../world/space/FloatingOrigin';
import type { Triple } from '../world/space/WorldPosition';
import { ColyseusConnection } from './ColyseusConnection';
import type { ShipController } from '../core/ShipController';
import type { TravelArrival, WorldSnapshot } from './shared/Protocol';
import type { GameMode } from './shared/GameMode';

export interface NetworkPlayer {
  id: string;
  username: string;
  position: THREE.Vector3;
  targetPosition: THREE.Vector3;
  quaternion: THREE.Quaternion;
  targetQuaternion: THREE.Quaternion;
  lastUpdate: number;
  bounty: number;
}

export class MultiplayerManager {
  public readonly endpoint = (import.meta.env.VITE_MULTIPLAYER_URL as string | undefined)?.trim() ?? '';
  public get authoritative() { return !!this.endpoint; }
  public get connected() { return !!this.online?.connected; }
  private online: ColyseusConnection | null = null;
  public onIdentity?: (id: string) => void;
  public onArrival?: (data: TravelArrival) => void;
  public onWorld?: (data: WorldSnapshot) => void;
  public onNotice?: (message: string) => void;
  public action(type: string, data: Record<string, unknown> = {}) { return this.online?.send(type, data) ?? false; }
  public drive(dt: number, controller: ShipController, ship: THREE.Group) {
    if (this.coordinateFrame) this.online?.frame(dt, controller, ship, this.coordinateFrame);
  }
  public toLocal(p: number[]) { const tuple: Triple = [p[0], p[1], p[2]]; return this.coordinateFrame?.fromAbsolute(tuple) ?? tuple; }
  public disconnect() {
    const leaving = this.online?.dispose(); this.online = null;
    if (this.channel) { void supabase.removeChannel(this.channel); this.channel = null; }
    if (this.botInterval) { clearInterval(this.botInterval); this.botInterval = null; }
    this.players.clear(); this.isSubscribed = false;
    return leaving ?? Promise.resolve();
  }
  private receiveWorld(data: WorldSnapshot) {
    for (const id of data.gone) this.players.delete(id);
    for (const entity of data.entities) {
      const position = new THREE.Vector3(...this.toLocal(entity.p)), quaternion = new THREE.Quaternion().fromArray(entity.q).normalize();
      let player = this.players.get(entity.id);
      if (!player) { player = { id: entity.id, username: entity.name, position: position.clone(), targetPosition: position.clone(),
        quaternion: quaternion.clone(), targetQuaternion: quaternion.clone(), lastUpdate: Date.now(), bounty: entity.bounty }; this.players.set(entity.id, player); }
      player.targetPosition.copy(position); player.targetQuaternion.copy(quaternion); player.bounty = entity.bounty; player.lastUpdate = Date.now();
    }
    this.onWorld?.(data);
  }
  public players: Map<string, NetworkPlayer> = new Map();
  private channel: any;
  private coordinateFrame: FloatingOrigin | null = null;
  private systemId: string | null = null;

  public setSystemId(id: string | null) {
    if (id === this.systemId) return;
    this.systemId = id; this.players.clear(); this.lastSendTime = 0;
  }
  private sameSystem(data: { systemId?: string }) { return (data.systemId ?? null) === this.systemId; }
  private systemTag() { return this.systemId ? { systemId: this.systemId } : {}; }

  public setCoordinateFrame(frame: FloatingOrigin) { this.coordinateFrame = frame; }
  public shiftOrigin(delta: THREE.Vector3) {
    for (const player of this.players.values()) { player.position.sub(delta); player.targetPosition.sub(delta); }
  }
  private readonly metrics = new RealtimeMetrics();
  private myId: string | null = null;
  private myUsername: string = 'Pilot';
  private lastSendTime = 0;
  private isSubscribed = false;
  private botInterval: any = null;
  
  public localPlayerPosition: THREE.Vector3 | null = null;
  public get drawDistance(): number {
    return Settings.graphicsMode === 'HIGH' ? 15000 : 6000;
  }
  
  public onShootCallback?: (data: {id: string, dirx: number, diry: number, dirz: number, color?: string, weaponType?: string}) => void;
  public onHitCallback?: (data: {targetId: string, damage: number, shooterId: string}) => void;
  public onDieCallback?: (data: {killedId: string, killerId: string, killerName: string}) => void;
  public onChatCallback?: (data: {username: string, message: string}) => void;
  public onSonarCallback?: (data: {id: string, posX: number, posY: number, posZ: number}) => void;
  public onVoiceSignalCallback?: (data: { senderId: string, signal: any }) => void;

  public init(userId: string, username: string, mode: GameMode = 'pvp') {
    this.disconnect();
    this.myId = userId;
    this.myUsername = username;
    if (this.authoritative) {
      this.online = new ColyseusConnection(this.endpoint, username, {
        identity: id => { this.myId = id; this.onIdentity?.(id); },
        arrival: data => { this.setSystemId(data.systemId); this.players.clear(); this.onArrival?.(data); },
        world: data => this.receiveWorld(data),
        event: (type, data) => {
          if (type === 'hit') this.onHitCallback?.(data);
          else if (type === 'die') this.onDieCallback?.(data);
          else if (type === 'chat') this.onChatCallback?.(data);
          else if (type === 'voice') this.onVoiceSignalCallback?.(data);
          else if (type === 'notice') this.onNotice?.(data.message);
          else if (type === 'misfire') window.dispatchEvent(new CustomEvent('WeaponMisfire'));
          else if (type === 'sonar') { const [posX, posY, posZ] = this.toLocal([data.posX, data.posY, data.posZ]); this.onSonarCallback?.({ ...data, posX, posY, posZ }); }
        },
      }, mode);
      return;
    }
    if (mode === 'exploration' || import.meta.env.VITE_LEGACY_REALTIME !== 'true') return;
    if (!isSupabaseConfigured) return;

    this.channel = supabase.channel('room:universe', {
      config: {
        broadcast: { ack: false }
      }
    });


    this.channel
      .on('broadcast', { event: 'position' }, (payload: any) => {
        this.metrics.recordReceived('position');
        this.handlePositionBroadcast(payload.payload);
      })
      .on('broadcast', { event: 'shoot' }, (payload: any) => {
        this.metrics.recordReceived('shoot');
        if (this.sameSystem(payload.payload) && this.onShootCallback && payload.payload.id !== this.myId) this.onShootCallback(payload.payload);
      })
      .on('broadcast', { event: 'hit' }, (payload: any) => {
        this.metrics.recordReceived('hit');
        if (this.sameSystem(payload.payload) && this.onHitCallback) this.onHitCallback(payload.payload);
      })
      .on('broadcast', { event: 'die' }, (payload: any) => {
        this.metrics.recordReceived('die');
        if (this.sameSystem(payload.payload) && this.onDieCallback) this.onDieCallback(payload.payload);
      })
      .on('broadcast', { event: 'chat' }, (payload: any) => {
        this.metrics.recordReceived('chat');
        if (this.onChatCallback) this.onChatCallback(payload.payload);
      })
      .on('broadcast', { event: 'sonar' }, (payload: any) => {
        this.metrics.recordReceived('sonar');
        if (this.sameSystem(payload.payload) && this.onSonarCallback && payload.payload.id !== this.myId) {
          const data = payload.payload;
          const global: Triple = [data.posX, data.posY, data.posZ];
          if (!global.every((value) => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER)) return;
          const [posX, posY, posZ] = this.coordinateFrame?.fromAbsolute(global) ?? global;
          this.onSonarCallback({ ...data, posX, posY, posZ });
        }
      })
      .on('broadcast', { event: 'voice-signal' }, (payload: any) => {
        this.metrics.recordReceived('voice-signal');
        if (this.sameSystem(payload.payload) && this.onVoiceSignalCallback && payload.payload.targetId === this.myId) {
          this.onVoiceSignalCallback(payload.payload);
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          this.isSubscribed = true;
          console.log('Connected to Universe Network with Combat System!');
        }
      });
  }

  public getDebugStats() {
    if (this.authoritative) return this.online?.stats() ?? { configured: true, subscribed: false, systemId: this.systemId, transport: 'colyseus', state: 'idle', ...this.metrics.snapshot() };
    return { configured: isSupabaseConfigured, subscribed: this.isSubscribed, systemId: this.systemId, ...this.metrics.snapshot() };
  }

  public broadcastPosition(pos: THREE.Vector3, quat: THREE.Quaternion) {
    if (this.authoritative) return;
    if (!this.channel || !this.myId || !this.isSubscribed) return;
    const now = Date.now();
    if (now - this.lastSendTime < 100) return; // 10Hz tick limit
    this.lastSendTime = now;

    const coordinates = pos.toArray() as Triple;
    const [x, y, z] = this.coordinateFrame?.toAbsolute(coordinates) ?? coordinates;
    this.metrics.recordSent('position');
    this.channel.send({
      type: 'broadcast',
      event: 'position',
      payload: {
        id: this.myId,
        username: this.myUsername,
        x, y, z,
        qx: quat.x, qy: quat.y, qz: quat.z, qw: quat.w,
        bounty: window.localPlayerBounty || 100,
        ...this.systemTag()
      }
    });
  }

  public broadcastShoot(dir: THREE.Vector3, color: string = 'red', weaponType: string = 'laser') {
    if (this.authoritative) { this.action('fire', { color, weapon: weaponType }); return; }
    if (!this.channel || !this.isSubscribed) return;
    this.metrics.recordSent('shoot');
    this.channel.send({
      type: 'broadcast', event: 'shoot',
      payload: { id: this.myId, dirx: dir.x, diry: dir.y, dirz: dir.z, color, weaponType, ...this.systemTag() }
    });
  }

  public broadcastHit(targetId: string, damage: number) {
    if (this.authoritative) return;
    if (!this.channel || !this.isSubscribed) return;
    this.metrics.recordSent('hit');
    this.channel.send({
      type: 'broadcast', event: 'hit',
      payload: { targetId, damage, shooterId: this.myId, ...this.systemTag() }
    });
  }

  public broadcastDie(killerId: string, killerName: string) {
    if (this.authoritative) return;
    if (!this.channel || !this.isSubscribed) return;
    this.metrics.recordSent('die');
    this.channel.send({
      type: 'broadcast', event: 'die',
      payload: { killedId: this.myId, killerId, killerName, ...this.systemTag() }
    });
  }

  public broadcastChat(message: string) {
    if (this.authoritative) { this.action('chat', { message }); return; }
    if (!this.channel || !this.isSubscribed) return;
    this.metrics.recordSent('chat');
    this.channel.send({
      type: 'broadcast', event: 'chat',
      payload: { username: this.myUsername, message }
    });
  }

  public broadcastSonar(pos: THREE.Vector3) {
    if (this.authoritative) { this.action('sonar'); return; }
    if (!this.channel || !this.isSubscribed) return;
    const coordinates = pos.toArray() as Triple;
    const [posX, posY, posZ] = this.coordinateFrame?.toAbsolute(coordinates) ?? coordinates;
    this.metrics.recordSent('sonar');
    this.channel.send({
      type: 'broadcast', event: 'sonar',
      payload: { id: this.myId, posX, posY, posZ, ...this.systemTag() }
    });
  }

  public sendVoiceSignal(targetId: string, signal: any) {
    if (this.authoritative) { this.action('voice', { targetId, signal }); return; }
    if (!this.channel || !this.isSubscribed) return;
    this.metrics.recordSent('voice-signal');
    this.channel.send({
      type: 'broadcast', event: 'voice-signal',
      payload: { senderId: this.myId, targetId, signal, ...this.systemTag() }
    });
  }

  private handlePositionBroadcast(data: any) {
    if (!this.sameSystem(data)) { if (data.id !== this.myId) this.players.delete(data.id); return; }
    if (data.id === this.myId) return; // Prevent local ghost
    const playerId = data.id;
    const coordinates: Triple = [data.x, data.y, data.z];
    if (!coordinates.every((value) => Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER)) return;
    const [x, y, z] = this.coordinateFrame?.fromAbsolute(coordinates) ?? coordinates;
    data = { ...data, x, y, z };

    // --- SPATIAL CULLING (NETWORK LAYER) ---
    // Ignore updates from ships outside our draw distance (Potato mode optimization)
    if (this.localPlayerPosition) {
      const distSq = this.localPlayerPosition.distanceToSquared(new THREE.Vector3(data.x, data.y, data.z));
      if (distSq > this.drawDistance * this.drawDistance) {
        return; // Drop packet, save RAM and CPU!
      }
    }

    let p = this.players.get(playerId);
    if (!p) {
      p = {
        id: playerId,
        username: data.username || 'Pilot',
        position: new THREE.Vector3(data.x, data.y, data.z),
        targetPosition: new THREE.Vector3(data.x, data.y, data.z),
        quaternion: new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw),
        targetQuaternion: new THREE.Quaternion(data.qx, data.qy, data.qz, data.qw),
        lastUpdate: Date.now(),
        bounty: data.bounty || 100
      };
      this.players.set(playerId, p);
    } else {
      p.targetPosition.set(data.x, data.y, data.z);
      p.targetQuaternion.set(data.qx, data.qy, data.qz, data.qw);
      p.lastUpdate = Date.now();
      p.bounty = data.bounty || 100;
    }
  }

  public update(dt: number) {
    const now = Date.now();
    for (const [id, p] of this.players.entries()) {
      let shouldDelete = false;

      if (!this.authoritative && now - p.lastUpdate > 5000) {
        shouldDelete = true;
      }

      // NO SPATIAL CULLING IN JS MEMORY! 
      // We must keep all entities in memory so the Minimap can map them globally. 
      // The visual culling is strictly handled in WorldBuilder.ts (InstancedMesh cutoff points).

      if (shouldDelete) {
        this.players.delete(id);
        continue;
      }
      
      // Smooth interpolation for silky 60fps movement despite 10Hz network tick
      p.position.lerp(p.targetPosition, Math.min(1, dt * 10));
      p.quaternion.slerp(p.targetQuaternion, Math.min(1, dt * 10));
    }
  }

  // --- STRESS TEST ---
  public spawnTestBots(count: number) {
    for (let i = 0; i < count; i++) {
      const id = `bot_${i}`;
      // Spawn randomly across the entire 40,000 unit galaxy!
      const startPos = new THREE.Vector3(
          (Math.random() - 0.5) * 40000, 
          (Math.random() - 0.5) * 4000, 
          (Math.random() - 0.5) * 40000
      );
      this.players.set(id, {
        id,
        username: `Bot ${i}`,
        position: startPos.clone(),
        targetPosition: startPos.clone(),
        quaternion: new THREE.Quaternion(),
        targetQuaternion: new THREE.Quaternion(),
        lastUpdate: Date.now() + 99999999, // Never timeout
        bounty: 100 + Math.floor(Math.random() * 500) // Random bounty for bots
      });
    }

    const cachedVec = new THREE.Vector3();
    const cachedEuler = new THREE.Euler();

    // Move bots in sine waves continuously
    if (this.botInterval) clearInterval(this.botInterval);
    this.botInterval = setInterval(() => {
      const now = Date.now();
      for (let i = 0; i < count; i++) {
        const id = `bot_${i}`;
        const p = this.players.get(id);
        if (p) {
          const t = now * 0.001 + i;
          // Slowly drift around center
          p.targetPosition.x += Math.sin(t) * 10 + (Math.random() - 0.5) * 5;
          p.targetPosition.y += Math.sin(t * 0.5) * 2;
          p.targetPosition.z += Math.cos(t) * 10 + (Math.random() - 0.5) * 5;
          
          // Constrain bots to stay within the galaxy bounds (20,000 radius from 0,0,0)
          const lenSq = p.targetPosition.lengthSq();
          if (lenSq > 400000000) { // 20000 * 20000
            cachedVec.copy(p.targetPosition).negate().normalize().multiplyScalar(50);
            p.targetPosition.add(cachedVec);
          }
          if (Math.random() < 0.05) {
            cachedEuler.set(0, Math.random() * Math.PI * 2, 0);
            p.targetQuaternion.setFromEuler(cachedEuler);
          }
        }
      }
    }, 100);
  }
}
