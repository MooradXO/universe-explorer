import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { readCsv } from './csv.mjs';

const HOSTS = new Set(['gea.esac.esa.int', 'simbad.cds.unistra.fr', 'ned.ipac.caltech.edu']);
export function catalogueTarget(url) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !HOSTS.has(target.hostname) || target.username || target.password) throw new Error('Unapproved catalogue host');
  return target;
}
export async function fetchCatalogue(url, { fetchImpl = fetch, extension = 'csv', maxBytes = 512 * 1024, timeoutMs = 35000 } = {}) {
  catalogueTarget(url);
  const started = Date.now();
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
    headers: { 'User-Agent': 'UniverseExplorer-CatalogResearch/0.1', Accept: extension === 'xml' ? 'application/x-votable+xml, application/xml' : 'text/csv' } });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Catalogue HTTP ${response.status}`); }
  const chunks = []; let bytes = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      if ((bytes += value.byteLength) > maxBytes) { await reader.cancel(); throw new Error('Catalogue response exceeds byte budget'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = Buffer.concat(chunks);
  return { body: body.toString('utf8'), metadata: { version: 1, url, fetchedAt: new Date().toISOString(), bytes,
    sha256: createHash('sha256').update(body).digest('hex'), elapsedMs: Date.now() - started } };
}
export function tapUrl(base, query, maxRows) {
  if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 10000) throw new Error('Preflight row budget exceeded');
  return base + '?' + new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', MAXREC: String(maxRows), QUERY: query });
}
export function adqlText(value) { return "'" + value.replaceAll("'", "''") + "'"; }
export function gaiaIdLiteral(value) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new Error('Invalid Gaia source_id');
  return value;
}

export class RemoteSnapshotClient {
  constructor(directory, { fetchImpl = fetch, delayImpl = delay } = {}) {
    this.directory = directory; this.fetch = fetchImpl; this.delay = delayImpl;
    this.tail = Promise.resolve(); this.lastCompleted = new Map();
  }
  get(name, url, { extension = 'csv', maxBytes = 16 * 1024 * 1024 } = {}) {
    const operation = this.tail.then(async () => {
      const target = catalogueTarget(url);
      if (!/^[a-z0-9-]+$/.test(name) || !/^(csv|xml|txt)$/.test(extension)) throw new Error('Invalid snapshot filename');
      const gap = target.hostname === 'ned.ipac.caltech.edu' ? 1100 : 300;
      const remaining = gap - (Date.now() - (this.lastCompleted.get(target.hostname) ?? 0));
      if (remaining > 0) await this.delay(remaining);
      try {
        const { body, metadata } = await fetchCatalogue(url, { fetchImpl: this.fetch, extension, maxBytes, timeoutMs: 55000 });
        await writeFile(join(this.directory, `${name}.${extension}`), body, { flag: 'wx' });
        await writeFile(join(this.directory, `${name}.source.json`), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
        return { body, metadata };
      } finally { this.lastCompleted.set(target.hostname, Date.now()); }
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }
}
export async function csvObjects(text, required, { maxRows = 10000 } = {}) {
  const rows = []; let fields;
  for await (const row of readCsv([text])) {
    if (!fields) {
      fields = row;
      if (new Set(fields).size !== fields.length || required.some(name => !fields.includes(name))) throw new Error('Unexpected remote CSV schema');
    } else {
      if (row.length !== fields.length) throw new Error('Remote CSV row width mismatch');
      if (rows.length >= maxRows) throw new Error('Remote CSV exceeds row budget');
      rows.push(Object.fromEntries(fields.map((name, i) => [name, row[i]])));
    }
  }
  if (!fields) throw new Error('Empty remote CSV');
  return rows;
}
