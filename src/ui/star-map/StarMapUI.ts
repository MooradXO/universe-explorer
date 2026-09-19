import type { Engine } from '../../core/Engine';
import { Settings } from '../../core/Settings';
import { StarMapClient } from '../../catalog/StarMapClient';
import { StarMapView } from '../../world/star-map/StarMapView';
import type { MapObject } from '../../catalog/StarMapData';
import { OnlineCatalogPanel } from './OnlineCatalogPanel';
import './star-map.css';

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const distance = (pc: number | null) => pc === null ? 'Distance unknown' : `${number.format(pc)} pc · ${number.format(pc * 3.261563777)} ly`;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
}
function button(text: string, action: () => void, label = text) {
  const node = element('button', '', text); node.type = 'button'; node.setAttribute('aria-label', label); node.onclick = action; return node;
}

export class StarMapUI {
  private dialog = element('dialog', 'star-map');
  private surface = element('div', 'star-map__surface');
  private status = element('p', 'star-map__status', 'Loading catalogue…');
  private searchStatus = element('p', 'star-map__hint', 'Name or ID: Sirius, HIP 32349, Gaia DR3…');
  private results = element('div', 'star-map__results');
  private card = element('section', 'star-map__card hud-metal-panel');
  private marker = element('div', 'star-map__marker');
  private search = element('input');
  private view?: StarMapView;
  private current?: MapObject;
  private lifetime = new AbortController();
  private query?: AbortController;
  private selection?: AbortController;
  private timer = 0;
  private closed = false;
  private statusTime = 0;
  private opener = document.activeElement as HTMLElement | null;
  private retry = button('Retry loading', () => this.view ? this.view.retry() : void this.load());
  private count = element('span', 'star-map__count');
  private online = new OnlineCatalogPanel(id => void this.select(id, true));

  constructor(private engine: Engine, private layer: HTMLElement, private onClose: () => void,
    private travel?: { currentSystemId: string; warp: (object: MapObject) => boolean }) {
    this.dialog.setAttribute('aria-labelledby', 'star-map-title');
    this.surface.setAttribute('aria-label', '3D star map');
    this.surface.tabIndex = 0;
    const heading = element('h1', '', 'STAR MAP'); heading.id = 'star-map-title';
    const title = element('div'); title.append(element('small', 'star-map__eyebrow', 'UNIVERSE EXPLORER / AT-HYG 4.0'), heading, this.count);
    const header = element('header', 'star-map__header hud-metal-panel');
    header.append(title, button('Return to flight ×', () => this.close(), 'Close star map'));
    const panel = element('section', 'star-map__search hud-metal-panel');
    const label = element('label', '', 'FIND A STAR'); label.htmlFor = 'star-map-search';
    this.search.id = 'star-map-search'; this.search.type = 'search'; this.search.maxLength = 100;
    this.search.placeholder = 'Sirius, Sol, HIP, Gaia DR3…'; this.search.autocomplete = 'off';
    this.results.setAttribute('aria-label', 'Search results');
    this.searchStatus.setAttribute('role', 'status');
    this.search.oninput = () => {
      window.clearTimeout(this.timer); this.query?.abort();
      this.results.replaceChildren();
      this.searchStatus.textContent = this.search.value.trim() ? 'Searching…' : 'Name or ID: Sirius, HIP 32349, Gaia DR3…';
      this.timer = window.setTimeout(() => void this.find(), 200);
    };
    panel.append(label, this.search, this.searchStatus, this.results,
      this.online.searchControl(() => this.search.value, (provider, query) => {
        this.selection?.abort(); this.online.cancel(); this.current = undefined;
        this.view?.select('', null); this.marker.hidden = true;
        this.card.removeAttribute('aria-busy');
        this.card.replaceChildren(element('small', 'star-map__eyebrow', 'EXTERNAL SOURCE'), element('h2', '', query));
        const output = element('div'); this.card.append(output);
        void this.online.search(provider, query, output);
      }));
    this.card.setAttribute('aria-label', 'Selected star');
    this.card.append(element('small', 'star-map__eyebrow', 'CATALOGUE OBJECT'), element('h2', '', 'Select a star'),
      element('p', '', 'Select a map point or find a star by name or catalogue ID.'));
    const tools = element('nav', 'star-map__tools hud-metal-panel'); tools.setAttribute('aria-label', 'Map controls');
    tools.append(button('+', () => this.view?.zoom(0.65), 'Zoom in'), button('−', () => this.view?.zoom(1.55), 'Zoom out'),
      button('Sol', () => void this.select('athyg:4.0:1', true)), button('Overview', () => this.view?.overview()));
    const footer = element('footer', 'star-map__footer');
    const credit = element('a', '', 'AT-HYG 4.0 · David Nash / Astronomy Nexus');
    credit.href = 'https://codeberg.org/astronexus/athyg'; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
    footer.append(element('span', '', 'True scale · J2000.0 · Drag to rotate. Scroll or pinch to zoom.'), credit);
    this.status.setAttribute('role', 'status'); this.retry.hidden = true;
    const loading = element('div', 'star-map__loading'); loading.append(this.status, this.retry);
    this.marker.hidden = true;
    this.dialog.append(this.surface, this.marker, header, panel, this.card, tools, loading, footer);
    // Stop game-wide keyboard/mouse shortcuts while native dialog keeps focus inside.
    for (const type of ['keydown', 'keyup', 'mousedown', 'mouseup', 'mousemove', 'click', 'wheel']) {
      this.dialog.addEventListener(type, event => event.stopPropagation());
    }
    this.dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    this.surface.addEventListener('keydown', event => {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); this.view?.zoom(0.65); }
      if (event.key === '-') { event.preventDefault(); this.view?.zoom(1.55); }
    });
    layer.append(this.dialog); layer.dataset.mapOpen = 'true';
    engine.shipController.setInputBlocked('star-map', true);
    window.dispatchEvent(new CustomEvent('PrimaryFireEnd'));
    if (document.pointerLockElement) document.exitPointerLock();
    this.dialog.showModal(); this.search.focus();
    void this.load();
  }

  private async load() {
    this.retry.hidden = true; this.status.textContent = 'Loading catalogue…';
    try {
      const manifest = await StarMapClient.manifest(this.lifetime.signal);
      if (this.closed) return;
      this.count.textContent = `${number.format(manifest.totalRecords)} records · ${number.format(manifest.positionedRecords)} in 3D`;
      this.view = new StarMapView(manifest, this.surface, Settings.graphicsMode === 'LOW',
        id => void this.select(id, false), (x, y, visible) => {
          this.marker.hidden = !visible;
          if (visible) this.marker.style.transform = `translate(${x}px, ${y}px)`;
        });
      const view = this.view;
      this.engine.setOverlayView({ scene: view.scene, camera: view.camera,
        resize: (w, h) => view.resize(w, h), snapshot: () => ({ ...view.snapshot(), selectedId: this.current?.id ?? null }),
        update: dt => { view.update(dt); this.updateStatus(dt); } });
      void this.select(this.travel?.currentSystemId ?? 'athyg:4.0:1', !!this.travel);
    } catch (error) {
      if (!this.closed) { this.status.textContent = (error as Error).message; this.retry.hidden = false; }
    }
  }
  private updateStatus(dt: number) {
    this.statusTime += dt;
    if (this.statusTime < 0.4 || !this.view) return;
    this.statusTime = 0;
    const state = this.view.snapshot();
    this.status.textContent = state.errors ? 'Some map data could not be loaded. Retry to load it.' :
      `${number.format(state.points)} points in view${state.pending ? ' · Loading…' : ''} · At centre: 100 px ≈ ${number.format(state.parsecsPer100Pixels * 3.261563777)} ly`;
    this.retry.hidden = !state.errors;
  }
  private async find() {
    const query = this.search.value.trim();
    if (!query || this.closed) return;
    this.query = new AbortController(); const controller = this.query;
    try {
      const results = await StarMapClient.search(query, controller.signal);
      if (controller.signal.aborted || this.closed) return;
      this.results.replaceChildren();
      this.searchStatus.textContent = results.length ? `${results.length === 20 ? 'First ' : ''}${results.length} results` : 'No matches. Try a Latin name or catalogue ID.';
      for (const result of results) {
        const row = button('', () => void this.select(result.id, true), `Select ${result.title}`);
        row.className = 'star-map__result';
        row.append(element('strong', '', result.title), element('small', '', result.positioned ? distance(result.distance) : 'No 3D position'));
        this.results.append(row);
      }
    } catch (error) { if (!controller.signal.aborted && !this.closed) this.searchStatus.textContent = (error as Error).message; }
  }
  private async select(id: string, focus: boolean) {
    this.online.cancel();
    this.selection?.abort(); this.selection = new AbortController(); const controller = this.selection;
    this.card.setAttribute('aria-busy', 'true');
    try {
      const value = await StarMapClient.object(id, controller.signal);
      if (controller.signal.aborted || this.closed) return;
      this.current = value; this.view?.select(value.id, value.position); this.marker.textContent = value.title;
      if (focus && value.position) this.view?.focus(value.position);
      this.showCard(value);
    } catch (error) {
      if (!controller.signal.aborted && !this.closed) {
        this.card.replaceChildren(element('p', '', (error as Error).message), button('Retry', () => void this.select(id, focus)));
      }
    } finally { if (!controller.signal.aborted) this.card.removeAttribute('aria-busy'); }
  }
  private showCard(value: MapObject) {
    this.card.replaceChildren(element('small', 'star-map__eyebrow', 'CATALOGUE OBJECT'), element('h2', '', value.title));
    this.card.append(element('p', 'star-map__distance', distance(value.distance)));
    const focus = button('Centre on star', () => { if (value.position) this.view?.focus(value.position); });
    focus.disabled = !value.position; this.card.append(focus);
    if (this.travel) {
      const same = value.id === this.travel.currentSystemId;
      const warp = button(same ? 'Current system' : 'Warp to star', () => { if (this.travel?.warp(value)) this.close(); });
      warp.disabled = same || !value.position || !value.positioned; this.card.append(warp);
      if (!same && value.position) this.card.append(element('p', 'star-map__hint', 'Travel to this system. Planets without observational data are generated for the game.'));
    }
    if (!value.position) this.card.append(element('p', 'star-map__notice', 'Distance is unknown. This object is searchable but has no 3D map position.'));
    if (value.gaiaMatches > 1) this.card.append(element('p', 'star-map__notice', `One Gaia ID is linked to ${value.gaiaMatches} AT-HYG records. Components remain separate.`));
    const facts = element('dl');
    const source: Record<string, string> = { G_R3: 'Gaia DR3', G_R2: 'Gaia DR2', H: 'Hipparcos', GJ: 'Gliese–Jahreiss', OTHER: 'Other source', N: 'Unknown' };
    for (const [label, text] of [
      ['Right ascension', value.raHours === null ? '—' : `${number.format(value.raHours)} h`],
      ['Declination', value.decDegrees === null ? '—' : `${number.format(value.decDegrees)}°`],
      ['Spectrum', value.spectrum ?? 'Not specified'],
      ['Magnitude', value.magnitude === null ? '—' : number.format(value.magnitude)],
      ['Distance source', source[value.distanceSource ?? 'N'] ?? value.distanceSource ?? '—'],
    ]) facts.append(element('dt', '', label), element('dd', '', text));
    this.card.append(facts);
    const identifiers = element('details'); identifiers.append(element('summary', '', 'Identifiers and accuracy'));
    identifiers.append(element('p', '', `AT-HYG 4.0 / ${value.id.split(':').pop()}`));
    for (const item of value.identifiers) identifiers.append(element('p', 'star-map__identifier', `${item.catalog}${item.release ? ' ' + item.release : ''}: ${item.value}`));
    identifiers.append(element('p', 'star-map__hint', 'Equatorial coordinates, equinox J2000.0. AT-HYG does not supply measurement epochs or uncertainties. Distance accuracy varies; point sizes and colours are illustrative.'));
    this.card.append(identifiers);
    this.card.append(this.online.enrichControl(value.id));
  }
  close() {
    if (this.closed) return;
    this.closed = true; window.clearTimeout(this.timer);
    this.lifetime.abort(); this.query?.abort(); this.selection?.abort();
    this.online.cancel();
    this.engine.setOverlayView(null); this.view?.dispose();
    this.dialog.close(); this.dialog.remove(); delete this.layer.dataset.mapOpen;
    this.engine.shipController.setInputBlocked('star-map', false);
    this.opener?.focus(); this.onClose();
  }
}
