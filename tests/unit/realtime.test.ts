// These tests explicitly cover the retained rollback transport.
vi.stubEnv('VITE_LEGACY_REALTIME', 'true');
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';

const network = vi.hoisted(() => ({
  enabled: false,
  callbacks: new Map<string, (data: unknown) => void>(),
  send: vi.fn(),
}));

vi.mock('../../src/core/Settings', () => ({ Settings: { graphicsMode: 'HIGH' } }));
vi.mock('../../src/lib/supabase', () => {
  const channel = {
    on: (_type: string, filter: { event: string }, callback: (data: unknown) => void) => {
      network.callbacks.set(filter.event, callback);
      return channel;
    },
    subscribe: (callback: (status: string) => void) => { callback('SUBSCRIBED'); return channel; },
    send: network.send,
  };
  return {
    get isSupabaseConfigured() { return network.enabled; },
    supabase: { channel: () => channel },
  };
});

import { MultiplayerManager } from '../../src/network/MultiplayerManager';
import { FloatingOrigin } from '../../src/world/space/FloatingOrigin';
import { worldPosition } from '../../src/world/space/WorldPosition';

it('isolates positions and combat between stars while chat stays global', () => {
  network.enabled = true; vi.stubGlobal('window', { localPlayerBounty: 100 });
  try {
    const manager = new MultiplayerManager(); manager.init('local', 'Pilot'); manager.setSystemId('athyg:4.0:1');
    const packet = { id: 'remote', x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, systemId: 'athyg:4.0:2' };
    network.callbacks.get('position')!({ payload: packet }); expect(manager.players.size).toBe(0);
    packet.systemId = 'athyg:4.0:1'; network.callbacks.get('position')!({ payload: packet }); expect(manager.players.size).toBe(1);
    for (const [event, callback] of [['shoot', 'onShootCallback'], ['hit', 'onHitCallback'], ['die', 'onDieCallback'], ['sonar', 'onSonarCallback']] as const) {
      const receive = vi.fn(); manager[callback] = receive;
      network.callbacks.get(event)!({ payload: { ...packet, posX: 0, posY: 0, posZ: 0 } }); expect(receive).toHaveBeenCalledTimes(1);
      network.callbacks.get(event)!({ payload: { ...packet, systemId: 'athyg:4.0:2' } }); expect(receive).toHaveBeenCalledTimes(1);
    }
    manager.broadcastPosition(new THREE.Vector3(), new THREE.Quaternion());
    expect(network.send.mock.calls.at(-1)![0].payload.systemId).toBe('athyg:4.0:1');
    manager.broadcastChat('Hello'); expect(network.send.mock.calls.at(-1)![0].payload).toEqual({ username: 'Pilot', message: 'Hello' });
    manager.setSystemId('athyg:4.0:2'); expect(manager.players.size).toBe(0);
  } finally { network.enabled = false; network.send.mockClear(); vi.unstubAllGlobals(); }
});

it('exchanges unchanged global payloads between clients with different local origins', () => {
  vi.stubGlobal('window', { localPlayerBounty: 100 }); network.enabled = true;
  try {
    const sender = new MultiplayerManager(); const senderFrame = new FloatingOrigin();
    senderFrame.moveTo(worldPosition([12, -4, 20], [100, 200, 300]));
    sender.setCoordinateFrame(senderFrame); sender.init('sender', 'Pilot');
    sender.broadcastPosition(new THREE.Vector3(20, 30, 40), new THREE.Quaternion());
    const packet = network.send.mock.calls.at(-1)![0];
    expect(packet.payload).toMatchObject({ x: 600120, y: -199770, z: 1000340 });
    expect(Object.keys(packet.payload).sort()).toEqual(['id', 'username', 'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw', 'bounty'].sort());

    const receiver = new MultiplayerManager(); const receiverFrame = new FloatingOrigin();
    receiverFrame.moveTo(worldPosition([12, -4, 20], [600, 200, 300]));
    receiver.setCoordinateFrame(receiverFrame); receiver.init('receiver', 'Pilot');
    receiver.localPlayerPosition = new THREE.Vector3();
    network.callbacks.get('position')!({ payload: packet.payload });
    const other = receiver.players.get('sender')!;
    expect(other.position.toArray()).toEqual([-480, 30, 40]);
    const delta = receiverFrame.moveTo(worldPosition([12, -4, 20], [10600, 200, 300]));
    receiver.shiftOrigin(new THREE.Vector3(...delta));
    expect(other.targetPosition.toArray()).toEqual([-10480, 30, 40]);
    expect(receiverFrame.toAbsolute(other.position.toArray())).toEqual([600120, -199770, 1000340]);
    network.callbacks.get('position')!({ payload: packet.payload });
    expect(other.targetPosition).toEqual(other.position);

    const sonar = vi.fn(); receiver.onSonarCallback = sonar;
    sender.broadcastSonar(new THREE.Vector3(20, 30, 40));
    network.callbacks.get('sonar')!({ payload: network.send.mock.calls.at(-1)![0].payload });
    expect(sonar).toHaveBeenCalledWith({ id: 'sender', posX: -10480, posY: 30, posZ: 40 });
  } finally {
    network.enabled = false; network.send.mockClear(); vi.unstubAllGlobals();
  }
});

it('counts actual send calls after throttling and incoming callbacks before distance filtering', () => {
  vi.stubGlobal('window', { localPlayerBounty: 100 });
  const clock = vi.spyOn(Date, 'now');
  try {
    const offline = new MultiplayerManager();
    offline.init('local', 'Pilot');
    offline.broadcastChat('Offline');
    expect(offline.getDebugStats().sendAttempts).toBe(0);

    network.enabled = true;
    const manager = new MultiplayerManager();
    manager.init('local', 'Pilot');
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    clock.mockReturnValue(1000);
    manager.broadcastPosition(position, rotation);
    clock.mockReturnValue(1050);
    manager.broadcastPosition(position, rotation);
    clock.mockReturnValue(1100);
    manager.broadcastPosition(position, rotation);
    expect(network.send).toHaveBeenCalledTimes(2);
    expect(manager.getDebugStats().byEvent.position.sendAttempts).toBe(2);

    manager.localPlayerPosition = position;
    network.callbacks.get('position')!({ payload: { id: 'remote', x: 100_000, y: 0, z: 0 } });
    expect(manager.players.size).toBe(0);
    expect(manager.getDebugStats().byEvent.position.received).toBe(1);
    expect(manager.getDebugStats().subscribed).toBe(true);
  } finally {
    network.enabled = false;
    network.send.mockClear();
    clock.mockRestore();
    vi.unstubAllGlobals();
  }
});
