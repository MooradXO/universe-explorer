import { afterAll, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile, readFile, appendFile, access, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ATHYG_FIELDS, normalizeAthygRow, validateAthygHeader, type AthygRow } from '../../src/catalog/adapters/AthygRecord';
import { readCsv } from '../../scripts/catalog/csv.mjs';
import { importAthyg } from '../../scripts/catalog/import-athyg.mjs';
import { ATHYG_SOURCE } from '../../scripts/catalog/athyg-source.mjs';
import { downloadRanges } from '../../scripts/catalog/download-ranges.mjs';
import { verifyPrepared } from '../../scripts/catalog/verify-athyg.mjs';

function row(changes: Partial<AthygRow> = {}): AthygRow {
  return { ...Object.fromEntries(ATHYG_FIELDS.map(field => [field, ''])),
    id: '2', gaia: '5310000000000000001', ra: '6', dec: '0', dist: '10',
    x0: '0', y0: '10', z0: '0', pos_src: 'T', dist_src: 'G_R3', mag: '5', ...changes,
  } as AthygRow;
}

async function* textChunks(text: string, size = 1) {
  for (let index = 0; index < text.length; index += size) yield text.slice(index, index + size);
}

async function collect(text: string) {
  const records = [];
  for await (const record of readCsv(textChunks(text))) records.push(record);
  return records;
}

describe('astronomical data normalization', () => {
  it('preserves exact string identities, independent measurement sources and unknown epoch', () => {
    const result = normalizeAthygRow(row({ dist_src: 'G_R2', hyg: '0', vx: '1', vy: '2', vz: '3' }));
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error(result.reason);
    expect(result.record.identifiers).toContainEqual({ catalog: 'gaia', release: 'DR3', value: '5310000000000000001' });
    expect(result.record.identifiers).toContainEqual({ catalog: 'hyg', release: null, value: '0' });
    expect(result.record.position).toMatchObject({ distanceSourceCode: 'G_R2', cartesianParsecs: [0, 10, 0], epochJulianYear: null, equinox: 'J2000.0' });
    expect(result.record.motion.cartesianVelocityKmSec).toEqual([1, 2, 3]);
    expect(result.record.quality.flags).toContain('cartesian-velocity-without-measured-rv');
  });

  it('does not turn unknown or invalid coordinates into the origin or an invented distance', () => {
    for (const changes of [
      { x0: '', y0: '', z0: '', dist: '', dist_src: 'N' },
      { x0: 'NaN' }, { dist: '-10' }, { ra: '24' }, { dec: '91' },
      { x0: '100', y0: '0', z0: '0' }, { dist_src: 'N' },
    ]) {
      const result = normalizeAthygRow(row(changes));
      if (!result.accepted) throw new Error(result.reason);
      expect(result.record.position.cartesianParsecs).toBeNull();
      expect(result.record.quality.position3d).not.toBe('available');
    }
  });

  it('preserves the solar reference and flags optional bad fields without dropping the star', () => {
    const result = normalizeAthygRow(row({ id: '1', ra: '0', dist: '0.00000485', x0: '0.00000485', y0: '0', mag: 'Infinity' }));
    if (!result.accepted) throw new Error(result.reason);
    expect(result.record.position.cartesianParsecs).toEqual([0.00000485, 0, 0]);
    expect(result.record.photometry.apparentMagnitude).toBeNull();
    expect(result.record.quality.flags).toContain('invalid-number:mag');
  });

  it('rejects invalid primary IDs and changed source schemas', () => {
    expect(normalizeAthygRow(row({ id: '1e3' }))).toEqual({ accepted: false, reason: 'invalid-primary-id' });
    expect(() => validateAthygHeader([...ATHYG_FIELDS].reverse())).toThrow('schema');
  });
});

describe('streaming CSV boundaries', () => {
  it('handles BOM, CRLF, quoted commas, newlines and doubled quotes across chunks', async () => {
    expect(await collect('\uFEFFid,name,empty\r\n1,"A, ""blue""\nstar",\r\n2,"",last')).toEqual([
      ['id', 'name', 'empty'], ['1', 'A, "blue"\nstar', ''], ['2', '', 'last'],
    ]);
  });
  it('fails on truncated or illegal quoting and bounded record overflow', async () => {
    await expect(collect('1,"unfinished')).rejects.toThrow('Truncated');
    await expect(collect('1,"closed"x')).rejects.toThrow('quoting');
    await expect((async () => { for await (const _ of readCsv(textChunks('abcdef'), { maxRecordCharacters: 3 })) { /* consume */ } })()).rejects.toThrow('size limit');
  });
});

const researchRoot = resolve('../.catalog-research');
await mkdir(researchRoot, { recursive: true });
const temporary = await mkdtemp(join(researchRoot, 'test-import-'));
afterAll(async () => {
  // This test owns this exact newly created directory; never clean an unchecked path.
  const target = resolve(temporary);
  if (!target.startsWith(researchRoot + sep) || !target.slice(researchRoot.length + 1).startsWith('test-import-')) throw new Error('Unsafe test cleanup');
  await rm(target, { recursive: true, force: true });
});

function encodeRow(value: AthygRow) {
  return ATHYG_FIELDS.map(field => `"${value[field].replaceAll('"', '""')}"`).join(',');
}
async function fixture(name: string, csv: string, truncate = false) {
  let buffer = gzipSync(csv);
  if (truncate) buffer = buffer.subarray(0, buffer.length - 8);
  const input = join(temporary, name + '.csv.gz');
  await writeFile(input, buffer);
  return { input, source: { ...ATHYG_SOURCE, archiveBytes: buffer.length, archiveSha256: createHash('sha256').update(buffer).digest('hex') } };
}

describe('complete offline import', () => {
  it('accounts for every input row, retains identity collisions and reproduces its dataset digest', async () => {
    const rows = [
      row({ id: '1', proper: 'Test, "Blue"\nComponent', gaia: '5310000000000000002' }),
      row(), row({ id: '3', x0: '', y0: '', z0: '', dist: '', dist_src: 'N' }),
      row({ id: '4', gaia: '' }), row({ id: '2', proper: 'Duplicate primary' }), row({ id: 'invalid' }),
    ];
    const input = await fixture('valid', [ATHYG_FIELDS.join(','), ...rows.map(encodeRow)].join('\r\n'));
    const first = await importAthyg({ ...input, output: join(temporary, 'first') });
    const second = await importAthyg({ ...input, output: join(temporary, 'second') });
    expect(first).toMatchObject({ inputRows: 6, acceptedRows: 4, rejectedRows: 2, position3d: { available: 3, missing: 1, invalid: 0 } });
    expect(first.rejectionReasons).toEqual({ 'duplicate-primary-id': 1, 'invalid-primary-id': 1 });
    expect(first.identityCollisions['gaia:DR3']).toMatchObject({ identifiers: 1, records: 2 });
    expect(first.datasetSha256).toBe(second.datasetSha256);
    expect(first.rejectedRowsSha256).toBe(second.rejectedRowsSha256);
    const database = new DatabaseSync(join(temporary, 'first/catalog.sqlite'), { readOnly: true });
    try {
      const stored = database.prepare('SELECT gaia_dr3_id, record_json, raw_json FROM objects WHERE row_number=1').get()!;
      expect(stored.gaia_dr3_id).toBe('5310000000000000002');
      expect(JSON.parse(stored.record_json as string).names[0]).toBe('Test, "Blue"\nComponent');
      expect(JSON.parse(stored.raw_json as string).gaia).toBe('5310000000000000002');
      expect(database.prepare('SELECT count(*) AS n FROM rejected_rows').get()?.n).toBe(2);
    } finally { database.close(); }
    await expect(access(join(temporary, 'first/INCOMPLETE'))).rejects.toThrow();
    const manifest = JSON.parse(await readFile(join(temporary, 'first/manifest.json'), 'utf8'));
    expect(manifest.status).toBe('complete');
    expect(await verifyPrepared(join(temporary, 'first'))).toMatchObject({ status: 'pass', inputRows: 6, allGaiaIdsPreserved: true });
    await appendFile(join(temporary, 'second/catalog.sqlite'), new Uint8Array([0]));
    await expect(verifyPrepared(join(temporary, 'second'))).rejects.toThrow('size mismatch');
    await expect(importAthyg({ ...input, output: join(temporary, 'first') })).rejects.toThrow();
  });

  it('rejects a checksum mismatch before creating output', async () => {
    const input = await fixture('checksum', ATHYG_FIELDS.join(',') + '\n' + encodeRow(row()));
    const output = join(temporary, 'bad-checksum');
    await expect(importAthyg({ ...input, source: { ...input.source, archiveSha256: '0'.repeat(64) }, output })).rejects.toThrow('SHA256');
    await expect(access(output)).rejects.toThrow();
  });

  it('never publishes a success manifest for a truncated gzip, even when its hash matches', async () => {
    const input = await fixture('truncated', ATHYG_FIELDS.join(',') + '\n' + encodeRow(row()), true);
    const output = join(temporary, 'truncated');
    await expect(importAthyg({ ...input, output })).rejects.toThrow();
    await expect(access(join(output, 'manifest.json'))).rejects.toThrow();
    await expect(access(join(output, 'INCOMPLETE'))).resolves.toBeUndefined();
  });

  it('resumes a byte range without duplicating the prefix and verifies its boundaries', async () => {
    const directory = join(temporary, 'range');
    await mkdir(directory);
    const partial = join(directory, 'archive.partial');
    await writeFile(partial, 'abc');
    const fetchMock = vi.fn(async (_url, options) => {
      expect(options.headers.Range).toBe('bytes=3-5');
      return new Response('def', { status: 206, headers: { 'content-range': 'bytes 3-5/3', 'content-length': '3' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const cleanup = await downloadRanges({ href: 'https://example.test/archive' }, partial, directory, 3, 6);
      expect(await readFile(partial, 'utf8')).toBe('abcdef');
      await cleanup();
    } finally { vi.unstubAllGlobals(); }
  });

  it('preserves the original prefix on wrong ranges or oversized bodies', async () => {
    for (const scenario of ['header', 'body']) {
      const directory = join(temporary, 'bad-range-' + scenario);
      await mkdir(directory);
      const partial = join(directory, 'archive.partial');
      await writeFile(partial, 'abc');
      vi.stubGlobal('fetch', async () => new Response(scenario === 'body' ? 'defghij' : 'def', {
        status: 206,
        headers: { 'content-range': scenario === 'header' ? 'bytes 2-4/6' : 'bytes 3-5/6', 'content-length': '3' },
      }));
      try {
        await expect(downloadRanges({ href: 'https://example.test/archive' }, partial, directory, 3, 6)).rejects.toThrow();
        expect(await readFile(partial, 'utf8')).toBe('abc');
      } finally { vi.unstubAllGlobals(); }
    }
  });
});
