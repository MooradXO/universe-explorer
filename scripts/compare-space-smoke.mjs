import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const evidence = 'docs/phases_archive/space-only-sprint-2026-09-15';
const beforeDir = process.argv[2] || join(evidence, 'before');
const afterDir = process.argv[3] || join(evidence, 'after');
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const failures = [];
const comparison = [];
const files = readdirSync(beforeDir).filter((name) => name.endsWith('.json'));
if (files.length !== 4) throw new Error('Expected all four baseline scenes');

for (const file of files) {
  const before = JSON.parse(readFileSync(join(beforeDir, file), 'utf8'));
  const after = JSON.parse(readFileSync(join(afterDir, file), 'utf8'));
  for (const data of [before, after]) {
    if (data.samples.length < 8 || data.issues.length) throw new Error(`Incomplete or failed smoke: ${file}`);
  }
  const first = before.samples[0];
  if (after.samples.some((sample) => sample.graphicsMode !== first.graphicsMode ||
      sample.renderer.width !== first.renderer.width || sample.renderer.height !== first.renderer.height ||
      sample.renderer.pixelRatio !== first.renderer.pixelRatio)) {
    throw new Error(`Render profile changed: ${file}`);
  }
  const metrics = {
    fps: (sample) => sample.fps,
    frameTimeMs: (sample) => sample.frameTimeMs,
    calls: (sample) => sample.renderer.calls,
    triangles: (sample) => sample.renderer.triangles,
  };
  for (const [metric, select] of Object.entries(metrics)) {
    const oldValue = mean(before.samples.map(select));
    const newValue = mean(after.samples.map(select));
    const ratio = newValue / oldValue;
    if (!Number.isFinite(ratio) || (metric === 'fps' ? ratio < 0.95 : ratio > 1.05)) {
      failures.push(`${file}: ${metric}`);
    }
    comparison.push({ scene: file.replace('.json', ''), metric,
      before: Number(oldValue.toFixed(2)), after: Number(newValue.toFixed(2)) });
  }
}
console.table(comparison);
if (failures.length) throw new Error(`Regression exceeds 5%: ${failures.join(', ')}`);
console.log('Same-machine relative performance budget (5% tolerance): PASS');
