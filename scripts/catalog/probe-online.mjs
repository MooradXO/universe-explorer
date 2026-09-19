import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// Deliberately fixed, tiny integration probe; this is not a catalogue export command.
const base = process.argv[2] ?? 'http://127.0.0.1:3001';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error('Use a local preview URL');
const directory = resolve('../.catalog-research/online-cache-v1');
async function diskBytes() {
  const files = await readdir(directory).catch(() => []);
  return (await Promise.all(files.map(async file => (await stat(join(directory, file))).size))).reduce((a, b) => a + b, 0);
}
const report = { checkedAt: new Date().toISOString(), beforeBytes: await diskBytes(), checks: [] };
for (const path of ['enrich/1440825', 'enrich/586693', 'online?source=ned&q=M31']) {
  const response = await fetch(`${base}/__catalog/${path}`);
  assert.equal(response.status, 200);
  const results = await response.json();
  for (const result of results) {
    if (path === 'enrich/586693' && result.provider === 'gaia') { assert.equal(result.status, 'not-found'); continue; }
    assert.equal(result.status, 'ok', `${path}: ${result.provider}`);
    for (const observation of result.observations) {
      assert.equal(typeof observation.source.value, 'string');
      assert.equal('cartesianParsecs' in observation.astrometry, false);
    }
    report.checks.push({ path, provider: result.provider, status: result.status, cache: result.cache, responseBytes: result.bytes,
      observedRecords: result.observations.length, localMatches: result.localMatches.length,
      measurementCount: Object.keys(result.observations[0].measurements).length, names: result.observations[0].names.length,
      sha256: result.observations[0].snapshotSha256 });
  }
  const second = await (await fetch(`${base}/__catalog/${path}`)).json();
  assert(second.every(value => value.status === 'not-found' || value.cache === 'cached'));
}
assert.equal((await fetch(`${base}/__catalog/online?source=gaia&q=1%20OR%201=1`)).status, 400);
assert.equal((await fetch(`${base}/__catalog/online?source=ned&q=M31`, { headers: { Origin: 'https://example.invalid' } })).status, 403);
report.afterBytes = await diskBytes(); report.limitBytes = 32 * 1024 * 1024;
assert(report.afterBytes <= report.limitBytes);
const evidence = resolve('docs/phases_archive/online-catalog-2026-09-15'); await mkdir(evidence, { recursive: true });
await writeFile(join(evidence, 'live-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
