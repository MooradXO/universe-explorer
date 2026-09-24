import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const evidence = 'docs/phases_archive/weapon-audio-2026-09-24';
await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { contents: "export * from './src/core/WeaponAudio'", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', globalName: 'AudioQA', write: false });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
function wav(channels: number[][], rate = 48000) {
  const frames = channels[0].length, bytes = frames * channels.length * 2, b = Buffer.alloc(44 + bytes);
  b.write('RIFF'); b.writeUInt32LE(36 + bytes, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels.length, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * channels.length * 2, 28);
  b.writeUInt16LE(channels.length * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels.length; c++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channels[c][i])) * 32767), 44 + (i * channels.length + c) * 2);
  return b;
}
try {
  await page.goto('http://127.0.0.1:3014/'); await page.addScriptTag({ content: 'window.__name = (fn) => fn;\n' + bundle.outputFiles[0].text });
  const result = await page.evaluate(async () => {
    const { WeaponAudio, createEffectsBus } = (window as any).AudioQA;
    const render = async (scenario: string) => {
      const ctx = new OfflineAudioContext(2, 48000 * (scenario === 'audition' ? 6 : scenario === 'burst' ? 4 : 2), 48000);
      const bus = createEffectsBus(ctx), audio = new WeaponAudio(ctx, bus);
      const play = (kind: string, color = 'red', volume = .3, position?: { x: number; y: number; z: number }, at = .02) => audio.play(kind, color, volume, position, at);
      if (scenario === 'audition') {
        play('laser'); play('laser', 'blue', .3, undefined, 1.4); play('shotgun', 'red', .34, undefined, 2.8); play('missile', 'red', .4, undefined, 4.2);
      } else if (scenario === 'stress') {
        for (let i = 0; i < 100; i++) play(i % 2 ? 'missile' : 'laser', 'red', .65, { x: i % 2 ? -450 : 450, y: 0, z: -100 });
        for (let i = 0; i < 4; i++) play('shotgun', 'red', .65);
      } else if (scenario === 'burst') {
        for (let i = 0; i < 15; i++) play('laser', 'red', .3, undefined, .02 + i * .2);
      } else {
        const x = scenario === 'left' ? -1000 : scenario === 'far' ? 6000 : 1000;
        play('laser', 'red', .4, { x, y: 0, z: -500 });
        if (scenario === 'rotated') ctx.listener.forwardZ.value = 1;
        if (scenario === 'shifted') { audio.shiftOrigin({ x: 100000, y: -20000, z: 80000 }); ctx.listener.positionX.value = -100000; ctx.listener.positionY.value = 20000; ctx.listener.positionZ.value = -80000; }
      }
      const voices = audio.snapshot(), rendered = await ctx.startRendering();
      const channels = [Array.from(rendered.getChannelData(0)), Array.from(rendered.getChannelData(1))];
      return { scenario, voices, channels, peak: Math.max(...channels.map(c => c.reduce((max, x) => Math.max(max, Math.abs(x)), 0))), rms: channels.map(c => Math.sqrt(c.reduce((sum, x) => sum + x * x, 0) / c.length)) };
    };
    const results = [];
    for (const name of ['audition', 'burst', 'stress', 'left', 'right', 'far', 'rotated', 'shifted']) results.push(await render(name));
    const live = new AudioContext(), liveAudio = new WeaponAudio(live, createEffectsBus(live)); await live.resume();
    for (let i = 0; i < 100; i++) liveAudio.play('laser', 'red', .3, { x: 1000, y: 0, z: 0 });
    const livePeak = liveAudio.snapshot(); await new Promise(resolve => setTimeout(resolve, 600)); const ended = liveAudio.snapshot(); await live.close();
    return { results, livePeak, ended };
  });
  const byName = Object.fromEntries(result.results.map(r => [r.scenario, r]));
  for (const r of result.results) assert.ok(r.peak > 0 && r.peak < .92, `${r.scenario} peak ${r.peak}`);
  assert.ok(byName.left.rms[0] > byName.left.rms[1] * 2); assert.ok(byName.right.rms[1] > byName.right.rms[0] * 2);
  assert.ok(byName.rotated.rms[0] > byName.rotated.rms[1] * 2);
  assert.ok(byName.far.rms[1] < byName.right.rms[1] * .4);
  assert.deepEqual(byName.shifted.channels, byName.right.channels);
  assert.equal(byName.stress.voices.active, 16); assert.equal(byName.stress.voices.spatial, 12); assert.equal(byName.stress.voices.dropped, 88);
  assert.equal(result.livePeak.active, 12); assert.equal(result.ended.active, 0);
  for (const r of result.results) if (['audition', 'burst', 'stress', 'left', 'right'].includes(r.scenario)) await writeFile(`${evidence}/${r.scenario}.wav`, wav(r.channels));
  const metrics = { results: result.results.map(({ channels, ...r }) => r), livePeak: result.livePeak, ended: result.ended };
  await writeFile(`${evidence}/audio-metrics.json`, JSON.stringify(metrics, null, 2)); console.log(JSON.stringify(metrics));
} finally { await browser.close(); }
