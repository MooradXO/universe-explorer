export type EngineTrailQuality = 'HIGH' | 'LOW';

export interface ShipVisualConfig {
  modelPath: string;
  scale: number;
  rotation: readonly [number, number, number];
  nozzles: readonly (readonly [number, number, number])[];
  laserMuzzleLocal?: readonly [number, number, number];
  forwardLocal?: readonly [number, number, number];
  nozzleSizes?: readonly number[];
  engineColor: number;
}

export const PLAYER_SHIP_VISUAL: ShipVisualConfig = {
  modelPath: '/models/player_ship.glb',
  scale: 28,
  rotation: [0, Math.PI, 0],
  nozzles: [
    [-35.44, 34.59, 50.5],
    [35.44, 34.59, 50.5],
    [-34.3, -45.31, 60.5],
    [34.3, -45.31, 60.5],
  ],
  laserMuzzleLocal: [0, 0, -64],
  forwardLocal: [0, 0, -1],
  nozzleSizes: [1.3, 1.3, 1.3, 1.3],
  engineColor: 0x22aaff,
};

export const BASE_STATION_VISUAL: ShipVisualConfig = {
  modelPath: '/models/base_ship_legacy_web_v3.glb',
  scale: 500,
  rotation: [0, 0, 0],
  nozzles: [],
  engineColor: 0x00ccff,
};

export const BOT_INTERCEPTOR_VISUAL: ShipVisualConfig = {
  modelPath: '/models/bot_interceptor.glb',
  scale: 34,
  rotation: [0, Math.PI, 0],
  nozzles: [],
  engineColor: 0xff3344,
};

export const BOT_BOMBER_VISUAL: ShipVisualConfig = {
  modelPath: '/models/bot_bomber.glb',
  scale: 42,
  rotation: [0, Math.PI, 0],
  nozzles: [],
  engineColor: 0xaa22ff,
};
