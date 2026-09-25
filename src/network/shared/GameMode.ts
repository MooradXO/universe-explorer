export const GAME_MODES = ['exploration', 'pvp'] as const;
export type GameMode = typeof GAME_MODES[number];
export function isGameMode(value: unknown): value is GameMode { return value === 'exploration' || value === 'pvp'; }
/** Preserve the existing PvP room identity; peaceful pilots have an isolated simulation. */
export function roomForMode(mode: GameMode) { return mode === 'pvp' ? 'universe-v1' : 'universe-exploration-v1'; }
export function modeLabel(mode: GameMode) { return mode === 'pvp' ? 'PvP' : 'Exploration'; }
