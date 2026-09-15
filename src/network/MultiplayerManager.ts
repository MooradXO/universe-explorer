import { isSupabaseConfigured, supabase } from '../lib/supabase';
import * as THREE from 'three';
import { Settings } from '../core/Settings';

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
  public players: Map<string, NetworkPlayer> = new Map();
  private channel: any;
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

  public init(userId: string, username: string) {
    this.myId = userId;
    this.myUsername = username;
    if (!isSupabaseConfigured) return;

    this.channel = supabase.channel('room:universe', {
      config: {
        broadcast: { ack: false }
      }
    });


    this.channel
      .on('broadcast', { event: 'position' }, (payload: any) => this.handlePositionBroadcast(payload.payload))
      .on('broadcast', { event: 'shoot' }, (payload: any) => {
        if (this.onShootCallback && payload.payload.id !== this.myId) this.onShootCallback(payload.payload);
      })
      .on('broadcast', { event: 'hit' }, (payload: any) => {
        if (this.onHitCallback) this.onHitCallback(payload.payload);
      })
      .on('broadcast', { event: 'die' }, (payload: any) => {
        if (this.onDieCallback) this.onDieCallback(payload.payload);
      })
      .on('broadcast', { event: 'chat' }, (payload: any) => {
        if (this.onChatCallback) this.onChatCallback(payload.payload);
      })
      .on('broadcast', { event: 'sonar' }, (payload: any) => {
        if (this.onSonarCallback && payload.payload.id !== this.myId) this.onSonarCallback(payload.payload);
      })
      .on('broadcast', { event: 'voice-signal' }, (payload: any) => {
        if (this.onVoiceSignalCallback && payload.payload.targetId === this.myId) {
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

  public broadcastPosition(pos: THREE.Vector3, quat: THREE.Quaternion) {
    if (!this.channel || !this.myId || !this.isSubscribed) return;
    const now = Date.now();
    if (now - this.lastSendTime < 100) return; // 10Hz tick limit
    this.lastSendTime = now;

    this.channel.send({
      type: 'broadcast',
      event: 'position',
      payload: {
        id: this.myId,
        username: this.myUsername,
        x: pos.x, y: pos.y, z: pos.z,
        qx: quat.x, qy: quat.y, qz: quat.z, qw: quat.w,
        bounty: window.localPlayerBounty || 100
      }
    });
  }

  public broadcastShoot(dir: THREE.Vector3, color: string = 'red', weaponType: string = 'laser') {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast', event: 'shoot',
      payload: { id: this.myId, dirx: dir.x, diry: dir.y, dirz: dir.z, color, weaponType }
    });
  }

  public broadcastHit(targetId: string, damage: number) {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast', event: 'hit',
      payload: { targetId, damage, shooterId: this.myId }
    });
  }

  public broadcastDie(killerId: string, killerName: string) {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast', event: 'die',
      payload: { killedId: this.myId, killerId, killerName }
    });
  }

  public broadcastChat(message: string) {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast', event: 'chat',
      payload: { username: this.myUsername, message }
    });
  }

  public broadcastSonar(pos: THREE.Vector3) {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast', event: 'sonar',
      payload: { id: this.myId, posX: pos.x, posY: pos.y, posZ: pos.z }
    });
  }

  public sendVoiceSignal(targetId: string, signal: any) {
    if (!this.channel || !this.isSubscribed) return;
    this.channel.send({
      type: 'broadcast', event: 'voice-signal',
      payload: { senderId: this.myId, targetId, signal }
    });
  }

  private handlePositionBroadcast(data: any) {
    if (data.id === this.myId) return; // Prevent local ghost
    const playerId = data.id;

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

      if (now - p.lastUpdate > 5000) {
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
      p.position.lerp(p.targetPosition, dt * 10);
      p.quaternion.slerp(p.targetQuaternion, dt * 10);
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
