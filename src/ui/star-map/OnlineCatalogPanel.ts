import { OnlineCatalogClient } from '../../catalog/OnlineCatalogClient';
import type { OnlineCatalogResult, OnlineProvider } from '../../catalog/OnlineCatalogData';
import type { ExternalObservation } from '../../catalog/ExternalObservation';

const names = { gaia: 'Gaia DR3', simbad: 'SIMBAD / CDS', ned: 'NASA/IPAC NED' };
const number = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 7 });
const labels: Record<string, string> = {
  parallax: 'Parallax', parallax_error: 'Parallax error', parallax_over_error: 'Parallax / error',
  plx_value: 'Parallax', plx_err: 'Parallax error', pmra: 'Proper motion RA', pmdec: 'Proper motion Dec',
  radial_velocity: 'Radial velocity', rvz_radvel: 'Radial velocity', phot_g_mean_mag: 'G magnitude', bp_rp: 'BP − RP colour',
  ruwe: 'Astrometric quality RUWE', teff_gspphot: 'Temperature (GSP-Phot)', logg_gspphot: 'Surface gravity (estimate)',
  mh_gspphot: 'Metallicity (estimate)', distance_gspphot: 'Distance (GSP-Phot model)', duplicated_source: 'Gaia duplicate flag',
  sp_type: 'Spectral type', coo_qual: 'Coordinate quality', morph_type: 'Morphology', o_class_morph: 'Morphology',
  rvz_redshift: 'Redshift z', z: 'Redshift z', unc_z: 'Redshift error', v_Sun: 'Heliocentric velocity',
  unc_v_Sun: 'Velocity error', d_Sun_3K: 'Redshift distance (CMB)', unc_d_Sun_3K: 'Redshift distance error',
  mean_distance: 'Mean redshift-independent distance', SEM_distance: 'Mean distance error',
  o_diam_maj_dia: 'Angular diameter', diameter_kpc: 'Physical diameter (estimate)', o_class_activity: 'Activity',
  o_footnote: 'NED note', HCONST: 'NED model: H₀', OMEGAM: 'NED model: Ωm', OMEGAV: 'NED model: ΩΛ',
};
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') {
  const value = document.createElement(tag); value.textContent = text; value.className = className; return value;
}
function link(title: string, href: string) {
  const value = node('a', title); value.href = href; value.target = '_blank'; value.rel = 'noopener noreferrer'; return value;
}
function observationCard(value: ExternalObservation) {
  const section = node('section', '', 'star-map__observation');
  section.append(node('h4', value.names[0] ?? `${value.source.catalog.toUpperCase()} ${value.source.release ?? ''} ${value.source.value}`));
  const facts = node('dl');
  const fact = (label: string, text: string, reference: string | null = null) => {
    const cell = node('dd', text);
    if (reference) cell.title = reference;
    if (reference && /^\d{4}.{15}$/.test(reference)) {
      cell.append(document.createTextNode(' '), link('↗', `https://ui.adsabs.harvard.edu/abs/${encodeURIComponent(reference)}/abstract`));
    }
    facts.append(node('dt', label), cell);
  };
  if (value.objectType) fact('Source object type', value.objectType);
  for (const [key, measurement] of Object.entries(value.measurements)) if (measurement.value !== null) {
    const text = typeof measurement.value === 'number' ? number.format(measurement.value) : typeof measurement.value === 'boolean' ? measurement.value ?  'Yes' : 'No' : measurement.value;
    fact(labels[key] ?? key, `${text}${measurement.unit ? ' ' + measurement.unit : ''}`, measurement.reference);
  }
  section.append(facts);
  const details = node('details'); details.append(node('summary', 'Names, coordinates and source'));
  details.append(node('p', value.names.join(' · ') || 'No proper name provided.', 'star-map__identifier'));
  const position = value.astrometry;
  details.append(node('p', `${position.frame}${position.equinox ? ' / ' + position.equinox : ''}; epoch: ${position.epochJulianYear ?? 'not supplied'}. RA: ${position.raDegrees ?? '—'}°; Dec: ${position.decDegrees ?? '—'}°.`, 'star-map__hint'));
  details.append(link('Open source response', value.queryUrl));
  for (const snapshot of value.relatedSnapshots ?? []) details.append(node('br'), link('Additional names source', snapshot.url));
  details.append(node('p', `SHA256: ${value.snapshotSha256}`, 'star-map__identifier star-map__hint'));
  section.append(details);
  if (value.flags.includes('aliases-unavailable')) section.append(node('p', 'Additional names are currently unavailable.', 'star-map__notice'));
  if (value.flags.includes('alias-list-truncated')) section.append(node('p', 'Showing the first 256 additional names.', 'star-map__notice'));
  return section;
}

/** Only explicit research actions use the network; changing points and frames does not. */
export class OnlineCatalogPanel {
  private controller?: AbortController;
  constructor(private onLocalSelect: (id: string) => void) {}

  searchControl(query: () => string, onSearch: (provider: OnlineProvider, query: string) => void) {
    const details = node('details', '', 'star-map__online-search');
    details.append(node('summary', 'Gaia · SIMBAD · NED'));
    const form = node('form');
    const label = node('label', 'Additional data source');
    const select = node('select'); select.setAttribute('aria-label', label.textContent!);
    for (const provider of ['simbad', 'gaia', 'ned'] as const) {
      const option = node('option', names[provider]); option.value = provider; select.append(option);
    }
    label.append(select);
    const submit = node('button', 'Search source'); submit.type = 'submit';
    form.append(label, node('p', 'Enter a name above: Sirius, M31, NGC 7000. Gaia requires a DR3 ID.', 'star-map__hint'), submit);
    form.onsubmit = event => { event.preventDefault(); if (query().trim()) onSearch(select.value as OnlineProvider, query().trim()); };
    details.append(form); return details;
  }
  enrichControl(id: string) {
    const section = node('section', '', 'star-map__online');
    const button = node('button', 'Look up Gaia and SIMBAD'); button.type = 'button';
    const output = node('div'); output.setAttribute('aria-label', 'Additional information');
    button.onclick = () => void this.load(output, signal => OnlineCatalogClient.enrich(id, signal));
    section.append(button, output); return section;
  }
  search(provider: OnlineProvider, query: string, output: HTMLElement) {
    return this.load(output, signal => OnlineCatalogClient.lookup(provider, query, signal));
  }
  private async load(output: HTMLElement, request: (signal: AbortSignal) => Promise<OnlineCatalogResult[]>) {
    this.cancel(); const controller = this.controller = new AbortController();
    const status = node('p', 'Requesting source data…', 'star-map__hint'); status.setAttribute('role', 'status');
    output.replaceChildren(status); output.setAttribute('aria-busy', 'true');
    const retry = () => {
      const button = node('button', 'Retry request'); button.type = 'button';
      button.onclick = () => void this.load(output, request); output.append(button);
    };
    try {
      const results = await request(controller.signal);
      if (controller.signal.aborted) return;
      output.replaceChildren();
      for (const result of results) {
        const section = node('section', '', 'star-map__source');
        section.append(node('h3', names[result.provider]));
        if (result.status !== 'ok') section.append(node('p', result.message ?? 'No exact match in this source.', 'star-map__hint'));
        if (result.fetchedAt) {
          const source = result.cache === 'stale' ? 'Source unavailable · cached data' : result.cache === 'cached' ? 'Cached data' : 'Fetched from source';
          section.append(node('p', `${source} · ${new Date(result.fetchedAt).toLocaleDateString('en-US')}`, 'star-map__hint'));
        }
        for (const observation of result.observations) section.append(observationCard(observation));
        if (result.localMatches?.length) {
          section.append(node('p', 'Related map records:', 'star-map__hint'));
          for (const match of result.localMatches) {
            const button = node('button', match.title); button.type = 'button';
            button.onclick = () => this.onLocalSelect(match.id); section.append(button);
          }
        }
        output.append(section);
      }
      if (results.some(result => result.status === 'unavailable' || result.cache === 'stale')) retry();
      if (results.some(result => result.status === 'ok')) output.append(node('p', 'Measurements retain their sources. Map positions currently come from AT-HYG.', 'star-map__hint'));
    } catch (error) {
      if (!controller.signal.aborted) { status.textContent = (error as Error).message; retry(); }
    } finally { if (!controller.signal.aborted) output.removeAttribute('aria-busy'); }
  }
  cancel() { this.controller?.abort(); }
}
