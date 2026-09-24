import { explorationSites } from '../../world/generation/ExplorationSites';
import { readSurveyJournal } from '../../world/generation/SurveyJournal';
import { moonDescriptors } from '../../world/generation/MoonModel';
import type { MapObject } from '../../catalog/StarMapData';
import { buildSystem, type SystemBody } from '../../world/systems/SystemDescriptor';
import { SYSTEM_CONFIG } from '../../world/systems/SystemConfig';

/** A schematic of game destinations, separate from the true-scale stellar map. */
export function systemPreview(object: MapObject, current: boolean, selectDestination?: (id: string) => boolean) {
  const system = buildSystem(object);
  const section = document.createElement('section'); section.className = 'star-map__system';
  section.setAttribute('aria-label', 'Planets in selected system');
  const heading = document.createElement('h3'); heading.textContent = 'PLANETS IN THIS SYSTEM';
  const note = document.createElement('p'); note.className = 'star-map__hint';
  note.textContent = object.id === SYSTEM_CONFIG.homeSystemId
    ? '8 Solar System planets · schematic, not to scale'
    : '4 procedural game planets · not confirmed observations';
  const planets = document.createElement('div'); planets.className = 'star-map__planets';
  const detail = document.createElement('div'); detail.className = 'star-map__planet-detail'; detail.setAttribute('aria-live', 'polite');
  const show = (body: SystemBody) => {
    for (const item of planets.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item.dataset.body === body.id));
    const title = document.createElement('strong'); title.textContent = body.name.replace(' · generated', '');
    const description = document.createElement('p'); description.className = 'star-map__hint';
    description.textContent = `${body.origin === 'catalogue' ? 'Solar System planet' : 'Procedural game planet'} · orbit ${body.orbit.semiMajorAu.toFixed(2)} AU · radius ${Math.round(body.radius * SYSTEM_CONFIG.kilometersPerUnit).toLocaleString('en-US')} km`;
    detail.replaceChildren(title, description);
    const model=document.createElement('p');model.className='star-map__hint';
    model.textContent=body.model.provenance==='illustrative-game-model' ? `Game climate: ${body.model.climate} · ${body.model.composition} · atmosphere ${body.model.atmosphere}. ${body.model.regions.join(' / ')}.` : `${body.model.regions.join(' / ')} · illustrative surface.`;
    detail.append(model);
    const moons=document.createElement('p');moons.className='star-map__hint';moons.textContent=`Satellites: ${moonDescriptors(body).length}`;detail.append(moons);
    const journal=readSurveyJournal(),sites=explorationSites(system).filter(s=>s.bodyId===body.id);
    const list=document.createElement('details');const summary=document.createElement('summary');summary.textContent=`Survey sites · ${sites.length}`;list.append(summary);
    for(const site of sites){const row=document.createElement('div'),text=document.createElement('p');text.className='star-map__hint';text.textContent=`${journal.has(site.id)?'✓ ':''}${site.name} · ${site.description}`;row.append(text);
      if(current&&selectDestination){const track=document.createElement('button');track.type='button';track.textContent=`Track ${site.name}`;track.onclick=()=>selectDestination(site.id);row.append(track);}list.append(row);}
    detail.append(list);
    if (current && selectDestination) {
      const action = document.createElement('button'); action.type = 'button'; action.textContent = `Set destination: ${title.textContent}`;
      action.onclick = () => selectDestination(body.id); detail.append(action);
    } else {
      const hint = document.createElement('p'); hint.className = 'star-map__hint'; hint.textContent = `Warp to ${object.title} to cruise between its planets.`; detail.append(hint);
    }
  };
  for (const body of system.bodies) {
    const item = document.createElement('button'); item.type = 'button'; item.className = 'star-map__planet';
    item.dataset.body = body.id; item.setAttribute('aria-label', `Inspect planet ${body.name.replace(' · generated', '')}`); item.setAttribute('aria-pressed', 'false');
    const icon = document.createElement('span'); icon.className = 'star-map__planet-icon'; icon.setAttribute('aria-hidden', 'true');
    icon.style.setProperty('--planet-color', `#${body.visual.visual.surfaceTint.toString(16).padStart(6, '0')}`);
    if (body.id.startsWith('sol/')) icon.style.backgroundImage = `radial-gradient(circle at 28% 25%,transparent 15%,#000b 78%),url('/assets/environments/low/${body.id.slice(4)}.webp')`;
    const label = document.createElement('span'); label.textContent = body.name.replace(' · generated', '');
    item.append(icon, label); item.onclick = () => show(body); planets.append(item);
  }
  section.append(heading, note, planets, detail); return section;
}
