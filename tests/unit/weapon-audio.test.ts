import { expect, it } from 'vitest';
import { weaponPCM } from '../../src/core/WeaponAudio';

it('synthesizes bounded finite original samples, silent endpoints and low DC at browser sample rates', () => {
  for (const sampleRate of [44100, 48000]) for (const kind of ['laser', 'shotgun', 'missile', 'impact'] as const) for (const variant of [0, 1, 2]) {
    const data = weaponPCM(kind, 'red', sampleRate, variant);
    let peak = 0, mean = 0, energy = 0;
    for (const x of data) { expect(Number.isFinite(x)).toBe(true); peak = Math.max(peak, Math.abs(x)); mean += x; energy += x * x; }
    expect(peak).toBeCloseTo(.86, 5); expect(Math.abs(mean / data.length)).toBeLessThan(.002);
    expect(Math.sqrt(energy / data.length)).toBeGreaterThan(.03);
    expect(data[0]).toBe(0); expect(data.at(-1)).toBe(0);
  }
});

it('keeps timbres and small repeated-shot variations distinct and deterministic', () => {
  const red = weaponPCM('laser', 'red', 48000), blue = weaponPCM('laser', 'blue', 48000);
  const shotgun = weaponPCM('shotgun', 'red', 48000), missile = weaponPCM('missile', 'red', 48000);
  expect(red).toEqual(weaponPCM('laser', 'red', 48000));
  const difference = (a: Float32Array, b: Float32Array) => a.reduce((sum, x, i) => sum + Math.abs(x - b[i]), 0) / a.length;
  expect(difference(red, blue)).toBeGreaterThan(.07); expect(difference(red, shotgun)).toBeGreaterThan(.05);
  expect(difference(red, weaponPCM('laser', 'red', 48000, 2))).toBeGreaterThan(.04);
  expect(missile.length).toBeGreaterThan(red.length * 2);
});
