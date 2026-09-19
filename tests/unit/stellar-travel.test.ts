import { expect, it, vi } from 'vitest';
import type { Engine } from '../../src/core/Engine';
import { SOLAR_CATALOG_OBJECT } from '../../src/world/systems/SystemDescriptor';
import { worldPosition } from '../../src/world/space/WorldPosition';
vi.mock('../../src/ui/SystemNavigationUI', () => ({ SystemNavigationUI: class { setSystem() {} update() {} dispose() {} } }));
import { StellarTravel } from '../../src/world/systems/StellarTravel';

it('commits a prepared warp once, preserves health, and cancels damage/death/unknown-position attempts', () => {
  const events = new EventTarget(), storage = new Map<string, string>();
  vi.stubGlobal('window', events); vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  const blocks = new Set<string>(), controller = { currentHP: 300, isDead: false, resetTransitMotion: vi.fn(),
    setInputBlocked: (reason: string, enabled: boolean) => enabled ? blocks.add(reason) : blocks.delete(reason) };
  const enter = vi.fn(); const position = worldPosition();
  const travel = new StellarTravel({ shipController: controller } as unknown as Engine,
    { enter, position: () => position, move: vi.fn(), base: () => [0, 0, 0], face: vi.fn(),
      rotation: () => [0, 0, 0, 1], restoreRotation: vi.fn(), combatNearby: () => false }, 'guest_test');
  try {
    travel.start(); expect(enter).toHaveBeenCalledTimes(1);
    const other = { ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:22' };
    expect(travel.warp({ ...other, position: null, positioned: false })).toBe(false);
    expect(travel.warp(SOLAR_CATALOG_OBJECT)).toBe(false);
    expect(travel.warp(other)).toBe(true); travel.update(1);
    expect(travel.snapshot().systemId).toBe('athyg:4.0:1'); expect(blocks.has('stellar-warp')).toBe(true);
    events.dispatchEvent(new Event('ShipDamaged')); travel.update(5);
    expect(enter).toHaveBeenCalledTimes(1); expect(blocks.size).toBe(0);
    travel.warp(other); controller.isDead = true; travel.update(5);
    expect(enter).toHaveBeenCalledTimes(1); controller.isDead = false;
    travel.warp(other); travel.update(2.5); travel.update(3);
    expect(enter).toHaveBeenCalledTimes(2); expect(travel.snapshot().systemId).toBe(other.id);
    expect(controller.currentHP).toBe(300); expect(blocks.size).toBe(0);
  } finally { travel.dispose(); vi.unstubAllGlobals(); }
});
