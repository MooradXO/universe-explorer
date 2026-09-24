/** Versions change independently. Appearance never changes collision data. */
export const GENERATOR = Object.freeze({ physics: 1, appearance: 3, survey: 1 });
export type GeneratorVersions = typeof GENERATOR;
/** Missing metadata is the original physical world, not a fresh seed. */
export function compatibleGenerator(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.physics === GENERATOR.physics && ['appearance','survey'].every(key => Number.isSafeInteger(v[key]) && (v[key] as number) > 0);
}
