import { mkdir, readdir, readFile, stat, unlink, writeFile, rename, utimes } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { catalogueTarget, fetchCatalogue } from './remote-snapshot.mjs';

export const OBSERVATION_CACHE_BYTES = 32 * 1024 * 1024;
const hash = text => createHash('sha256').update(text).digest('hex');
const ownFile = /^[a-f0-9]{64}\.json$/;

/** Dedicated, disposable cache. Serial writes bound disk use, including the temporary file. */
export class ObservationCache {
  constructor(directory, { maxBytes = OBSERVATION_CACHE_BYTES, ttlMs = 30 * 86400000,
    fetchImpl = fetch, delayImpl = delay, now = Date.now } = {}) {
    this.directory = resolve(directory); this.maxBytes = maxBytes; this.ttlMs = ttlMs;
    this.fetch = fetchImpl; this.delay = delayImpl; this.now = now;
    this.tail = Promise.resolve(); this.pending = new Map(); this.lastCompleted = new Map();
  }
  get(url, extension, validate) {
    catalogueTarget(url);
    const key = hash(url);
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size >= 8) return Promise.reject(new Error('Catalogue request queue full'));
    const operation = this.tail.then(() => this.load(key, url, extension, validate));
    this.pending.set(key, operation); this.tail = operation.catch(() => undefined);
    operation.then(() => this.pending.delete(key), () => this.pending.delete(key));
    return operation;
  }
  async load(key, url, extension, validate) {
    await mkdir(this.directory, { recursive: true });
    // Startup also repairs an interrupted write and enforces the current configured cap.
    await this.trim(0);
    const file = join(this.directory, `${key}.json`);
    let cached;
    try {
      if ((await stat(file)).size > this.maxBytes) throw new Error('Oversized cache file');
      const entry = JSON.parse(await readFile(file, 'utf8'));
      if (entry.metadata.url !== url || hash(entry.body) !== entry.metadata.sha256 || !Number.isFinite(Date.parse(entry.metadata.fetchedAt))) throw new Error('Invalid cached snapshot');
      const value = await validate(entry);
      cached = { ...entry, value };
      await utimes(file, new Date(), new Date());
      if (this.now() - Date.parse(entry.metadata.fetchedAt) < this.ttlMs) return { ...cached, cache: 'cached' };
    } catch (error) {
      if (error.code !== 'ENOENT') await unlink(file).catch(() => {});
    }
    const host = new URL(url).hostname;
    const remaining = (host === 'ned.ipac.caltech.edu' ? 1100 : 300) - (this.now() - (this.lastCompleted.get(host) ?? 0));
    if (remaining > 0) await this.delay(remaining);
    try {
      const entry = await fetchCatalogue(url, { extension, fetchImpl: this.fetch });
      const value = await validate(entry); // Never cache malformed, truncated or API-error responses.
      const json = JSON.stringify(entry);
      const bytes = Buffer.byteLength(json);
      if (bytes > this.maxBytes) throw new Error('Snapshot exceeds cache budget');
      await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await this.trim(bytes);
      await writeFile(join(this.directory, 'pending.tmp'), json);
      await rename(join(this.directory, 'pending.tmp'), file);
      return { ...entry, value, cache: 'fresh' };
    } catch (error) {
      if (cached) return { ...cached, cache: 'stale' };
      throw error;
    } finally { this.lastCompleted.set(host, this.now()); }
  }
  async trim(incomingBytes) {
    // Only this module's exact filenames inside its resolved cache directory are disposable.
    await unlink(join(this.directory, 'pending.tmp')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    const entries = [];
    for (const name of await readdir(this.directory)) if (ownFile.test(name)) {
      const details = await stat(join(this.directory, name));
      entries.push({ name, bytes: details.size, age: details.mtimeMs });
    }
    let bytes = entries.reduce((total, item) => total + item.bytes, 0);
    entries.sort((a, b) => a.age - b.age || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (bytes + incomingBytes <= this.maxBytes) break;
      await unlink(join(this.directory, entry.name)); bytes -= entry.bytes;
    }
  }
}
