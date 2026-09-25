export const MUSIC_EVENT = 'UniverseMusicSettings';
const KEY = 'universe:music:v1';
let enabled = true, volume = .45;
try {
  const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
  if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(1, saved.volume));
} catch { /* Storage is optional in private browsing. */ }
export const musicSettings = {
  get enabled() { return enabled; }, get volume() { return volume; },
  set(next: { enabled?: boolean; volume?: number }) {
    if (typeof next.enabled === 'boolean') enabled = next.enabled;
    if (typeof next.volume === 'number' && Number.isFinite(next.volume)) volume = Math.max(0, Math.min(1, next.volume));
    try { localStorage.setItem(KEY, JSON.stringify({ enabled, volume })); } catch { /* optional */ }
    window.dispatchEvent(new Event(MUSIC_EVENT));
  },
};
