import { expect, it, vi } from 'vitest';
import type { Engine } from '../../src/core/Engine';
import { SOLAR_CATALOG_OBJECT } from '../../src/world/systems/SystemDescriptor';
import { worldPosition } from '../../src/world/space/WorldPosition';
const controls = vi.hoisted(() => ({ select: (_id: string) => {}, cruise: () => {} }));
vi.mock('../../src/ui/SystemNavigationUI', () => ({ SystemNavigationUI: class {
  constructor(select: (id: string) => void, cruise: () => void) { controls.select = select; controls.cruise = cruise; }
  setSystem() {} update() {} dispose() {}
} }));
import { StellarTravel } from '../../src/world/systems/StellarTravel';
import type { SelfSnapshot } from '../../src/network/shared/Protocol';

it('preserves an unsupported future flight save instead of overwriting it during fallback play',()=>{
  const key='universe:stellar-flight:v1:guest',raw=JSON.stringify({version:1,generator:{physics:2,appearance:1,survey:1}}),storage=new Map([[key,raw]]);
  vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',new EventTarget());
  vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v)});
  const travel=new StellarTravel({shipController:{isDead:false,setInputBlocked:vi.fn(),resetTransitMotion:vi.fn()}} as unknown as Engine,
    {enter:vi.fn(),position:()=>worldPosition(),move:vi.fn(),base:()=>[0,0,0],face:vi.fn(),rotation:()=>[0,0,0,1],restoreRotation:vi.fn(),combatNearby:()=>false},'guest_test');
  try{travel.start();travel.save();expect(storage.get(key)).toBe(raw);expect(travel.snapshot().preservedSave).toBe(true);expect(travel.snapshot().status).toContain('newer world save');}
  finally{travel.dispose();vi.unstubAllGlobals();}
});

it('commits a prepared warp once, preserves health, and cancels damage/death/unknown-position attempts', () => {
  const events = new EventTarget(), storage = new Map<string, string>();
  vi.stubGlobal('window', events); vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
  const blocks = new Set<string>(), controller = { currentHP: 300, isDead: false, resetTransitMotion: vi.fn(), levelTransitOrientation: vi.fn(),
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

it('keeps server-confirmed warp visible after a stale pre-request snapshot and waits for arrival', () => {
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', new EventTarget());
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  const blocks = new Set<string>(), controller = { isDead: false, resetTransitMotion: vi.fn(),
    setInputBlocked: (reason: string, enabled: boolean) => enabled ? blocks.add(reason) : blocks.delete(reason) };
  const enter = vi.fn(), send = vi.fn(() => true);
  const travel = new StellarTravel({ shipController: controller } as unknown as Engine,
    { enter, position: () => worldPosition(), move: vi.fn(), base: () => [0, 0, 0], face: vi.fn(),
      rotation: () => [0, 0, 0, 1], restoreRotation: vi.fn(), combatNearby: () => false }, 'guest_test', send);
  const state = { cruise: null, warp: null, flight: { v: [0, 0, 0] }, travelStatus: '' } as unknown as SelfSnapshot;
  const other = { ...SOLAR_CATALOG_OBJECT, id: 'athyg:4.0:22', title: 'Other star' };
  try {
    travel.start(); expect(travel.warp(other)).toBe(true);
    travel.applyNetwork(state); expect(travel.warping).toBe(false);
    travel.applyNetwork({ ...state, warp: other.id });
    expect(travel.warping).toBe(true); expect(blocks.has('stellar-warp')).toBe(true);
    travel.update(5); expect(enter).toHaveBeenCalledTimes(1); expect(travel.warping).toBe(true);
    travel.applyArrival({ systemId: other.id, epoch: 2, object: other, position: [0, 0, 300], respawn: false });
    expect(enter).toHaveBeenCalledTimes(2); expect(travel.warping).toBe(false); expect(blocks.has('stellar-warp')).toBe(false);
    travel.applyNetwork({ ...state, cruise: 'sol/mars' }); send.mockClear(); travel.returnToBase();
    expect(send.mock.calls.map(call => call[0])).toEqual(['stop', 'base']);
    travel.applyNetwork({ ...state, warp: SOLAR_CATALOG_OBJECT.id }); expect(travel.warping).toBe(true);
    travel.applyNetwork(state); expect(travel.warping).toBe(false); expect(blocks.has('stellar-warp')).toBe(false);
    travel.applyArrival({ systemId: SOLAR_CATALOG_OBJECT.id, epoch: 3, object: SOLAR_CATALOG_OBJECT, position: [0, 0, 300], respawn: false });
    controls.select('sol/earth'); controls.cruise();
    travel.applyNetwork({ ...state, cruise: 'sol/earth' });
    controls.select('sol/mars'); send.mockClear();
    travel.applyNetwork({ ...state, cruise: 'sol/earth' });
    expect(travel.snapshot().selected).toBe('sol/mars');
    controls.cruise(); expect(send).not.toHaveBeenCalled();
    travel.applyNetwork(state); controls.cruise();
    expect(send).toHaveBeenCalledWith('cruise', { target: 'sol/mars' });
    travel.applyNetwork({ ...state, warp: other.id }); travel.connectionLost();
    expect(travel.warping).toBe(false); expect(blocks.has('stellar-warp')).toBe(false);
  } finally { travel.dispose(); vi.unstubAllGlobals(); }
});
