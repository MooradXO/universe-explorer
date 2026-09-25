import { MUSIC_EVENT, musicSettings } from '../core/MusicSettings';
import './styles/music-controls.css';

export function mountMusicControls(host: HTMLElement, id: string) {
  host.classList.add('music-controls');
  host.innerHTML = `<button type="button" class="music-toggle" aria-label="Ambient music" aria-pressed="true"><span aria-hidden="true">♫</span><span class="music-label"></span></button>
    <label for="${id}" class="music-volume-label">Volume</label><input id="${id}" type="range" min="0" max="100" step="1" aria-label="Music volume"><output for="${id}"></output>`;
  const toggle = host.querySelector('button')!, label = host.querySelector('.music-label')!, range = host.querySelector('input')!, output = host.querySelector('output')!;
  const refresh = () => { toggle.setAttribute('aria-pressed', String(musicSettings.enabled)); label.textContent = `Music ${musicSettings.enabled ? 'on' : 'off'}`; range.value = String(Math.round(musicSettings.volume * 100)); output.textContent = `${range.value}%`; };
  toggle.onclick = () => { musicSettings.set({ enabled: !musicSettings.enabled }); window.dispatchEvent(new Event('StartAmbient')); };
  range.oninput = () => { musicSettings.set({ volume: Number(range.value) / 100 }); window.dispatchEvent(new Event('StartAmbient')); };
  for (const event of ['keydown', 'keyup', 'pointerdown', 'pointerup']) host.addEventListener(event, e => e.stopPropagation());
  window.addEventListener(MUSIC_EVENT, refresh); refresh();
  return () => window.removeEventListener(MUSIC_EVENT, refresh);
}
