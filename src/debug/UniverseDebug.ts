import type { Engine } from '../core/Engine';
import type { WorldBuilder } from '../world/WorldBuilder';
import { Settings } from '../core/Settings';

type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T;

function freezeSnapshot<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeSnapshot);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function createUniverseDebug(engine: Engine, world: WorldBuilder) {
  return Object.freeze({
    version: 1,
    snapshot: () => {
      const info = engine.renderer.info;
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      return freezeSnapshot({
        timestampMs: performance.now(),
        ...engine.frameMetrics.snapshot(),
        graphicsMode: Settings.graphicsMode,
        starMap: engine.getOverlaySnapshot(),
        flightInputBlocked: engine.shipController.inputBlocked,
        renderer: {
          calls: info.render.calls, triangles: info.render.triangles,
          points: info.render.points, lines: info.render.lines,
          geometries: info.memory.geometries, textures: info.memory.textures,
          programs: info.programs?.length ?? 0,
          pixelRatio: engine.renderer.getPixelRatio(),
          width: engine.renderer.domElement.width, height: engine.renderer.domElement.height,
        },
        memory: {
          jsHeapUsedBytes: memory?.usedJSHeapSize ?? null,
          jsHeapAllocatedBytes: memory?.totalJSHeapSize ?? null,
          // WebGL exposes object counts, not a reliable GPU byte total.
          gpuBytes: null,
        },
        world: world.getDebugState(),
        realtime: world.multiplayer.getDebugStats(),
      });
    },
    planets: () => freezeSnapshot(world.getPlanetDebugDescriptors()),
  });
}

export function installUniverseDebug(engine: Engine, world: WorldBuilder): void {
  const api = createUniverseDebug(engine, world);
  Object.defineProperty(window, '__UNIVERSE_DEBUG__', {
    value: api, writable: false, configurable: true, enumerable: false,
  });
}

export type UniverseDebug = ReturnType<typeof createUniverseDebug>;

declare global {
  interface Window { readonly __UNIVERSE_DEBUG__: UniverseDebug; }
}
