import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SelfSnapshot } from '../src/network/shared/Protocol';
import { compatibleGenerator, GENERATOR } from '../src/world/generation/GeneratorContract';

interface SavedGuest { id: string; at: number; state?: SelfSnapshot; }
/** Only server-authored saves. Browser saves and claimed player IDs are never trusted. */
export class GuestStore {
  private guests = new Map<string, SavedGuest>();
  constructor(private path?: string) {
    if (path && existsSync(path)) {
      const saved = JSON.parse(readFileSync(path, 'utf8'));
      if (saved.version !== 1 || !compatibleGenerator(saved.generator) || !Array.isArray(saved.guests)) throw new Error('Unsupported guest save file');
      this.guests = new Map(saved.guests); this.prune();
    }
  }
  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
  identity(token: unknown) {
    if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) {
      const saved = this.guests.get(this.hash(token));
      if (saved && Date.now() - saved.at < 30 * 86400000) { saved.at = Date.now(); return { ...saved, token }; }
    }
    this.prune();
    const fresh = randomBytes(32).toString('hex'), guest = { id: `guest_${randomUUID()}`, at: Date.now() };
    this.guests.set(this.hash(fresh), guest); return { ...guest, token: fresh, state: undefined };
  }
  save(token: string, state: SelfSnapshot) { const item = this.guests.get(this.hash(token)); if (item) { item.state = structuredClone(state); item.at = Date.now(); } }
  private prune() {
    for (const [key, value] of this.guests) if (Date.now() - value.at > 30 * 86400000) this.guests.delete(key);
    if (this.guests.size >= 10000) {
      const oldest = [...this.guests].sort((a, b) => a[1].at - b[1].at).slice(0, this.guests.size - 9999);
      for (const [key] of oldest) this.guests.delete(key);
    }
  }
  flush() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const temp = `${this.path}.tmp`; writeFileSync(temp, JSON.stringify({ version: 1, generator: GENERATOR, guests: [...this.guests] }), { mode: 0o600 }); renameSync(temp, this.path);
  }
}
