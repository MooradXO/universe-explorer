/** URL fixtures position a guest once; normal flight input remains active. */
export const SPACE_SMOKE_STATES = ['near-base', 'planet-showcase', 'sector-boundary', 'sector-tour'] as const;
export type SpaceSmokeState = typeof SPACE_SMOKE_STATES[number];
export const SPACE_SMOKE_BASE = [0, 0, 8000] as const;

export function getSpaceSmokeState(search: string): SpaceSmokeState | null {
  const name = new URLSearchParams(search).get('spaceSmoke');
  return SPACE_SMOKE_STATES.find((state) => state === name) ?? null;
}
