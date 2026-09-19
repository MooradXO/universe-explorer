import { createSeededRandom, hashString } from '../celestial/WorldSeed';
import type { Triple } from '../space/WorldPosition';
import { SURFACES, ENVIRONMENT_VERSION, MATERIALS } from './EnvironmentLibrary';

export interface EnvironmentProfile {
  version: number; seed: number; signature: string; surface: number; variant: number; material: number;
  colors: readonly string[]; geography: number; warp: number; clouds: number | null; atmosphere: number | null;
  aurora: number | null; ring: { recipe: number; inner: number; outer: number; tilt: Triple; density: number; tint: string } | null;
  objects: number; layout: number; structure: number | null; phenomenon: number; moonStyle: number; moonOrbit: number; moonCount: number;
  zones: number; backdrop: { shape: number; warm: string; cool: string; density: number; scale: number; drift: number };
  approachDirections:Triple[];
}
interface Body { id: string; radius: number; position:Triple; visual: { biome: string } }
const solarSurfaces: Record<string, number> = { mercury: 0, venus: 56, earth: 32, mars: 4, jupiter: 50, saturn: 48, uranus: 56, neptune: 51 };
const palettePairs = [['#bf795b','#708bab'],['#827194','#5697ac'],['#a09a75','#557a82'],['#bc9061','#6c728d'],['#7a8696','#bba095'],['#698785','#a0829a'],['#aa725c','#8b989f'],['#6e819f','#b3b69b']];
function blend(a:string,b:string,amount:number){return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-amount)+parseInt(b.slice(i,i+2),16)*amount).toString(16).padStart(2,'0')).join('');}

/** Scientific positions/radii and the old orbit random stream never enter this art stream. */
export function systemEnvironmentProfiles(systemId: string, bodies: readonly Body[]): EnvironmentProfile[] {
  const usedSurfaces = new Set<number>(), usedLayouts = new Set<number>(), usedPhenomena = new Set<number>(), usedObjects = new Set<number>();
  const solar = systemId === 'athyg:4.0:1';
  return bodies.map(body => {
    const seed = hashString(`${systemId}:${body.id}:environment:v${ENVIRONMENT_VERSION}`), rng = createSeededRandom(seed);
    const pick = (count: number, used: Set<number>) => { let n = Math.floor(rng() * count); for (let i = 0; i < count && used.has(n); i++) n = (n + 1) % count; used.add(n); return n; };
    let candidates = SURFACES.map((_, i) => i).filter(i => body.radius > 1800 ? i >= 48 : i < 48);
    const unused=candidates.filter(i=>!usedSurfaces.has(i));if(unused.length)candidates=unused;
    // Every small system covers different large-scale geology groups before repeating one.
    const usedGroups = new Set([...usedSurfaces].map(i => SURFACES[i].group));
    const fresh = candidates.filter(i => !usedGroups.has(SURFACES[i].group)); if (fresh.length) candidates = fresh;
    let surface = candidates[Math.floor(rng() * candidates.length)];
    const name = body.id.split('/').pop()!;
    if (solar) surface = solarSurfaces[name];
    usedSurfaces.add(surface);
    const recipe = SURFACES[surface], variant = Math.floor(rng() * 8), material = surface * 2 + Math.floor(rng() * 2);
    const colors = [...recipe.colors];
    // Palette selection is subordinate to morphology; it never counts as a family.
    const tint = palettePairs[Math.floor(rng() * palettePairs.length)];
    if (recipe.kind === 'gas') { colors[1] = tint[0]; colors[3] = tint[1]; }
    else {colors[0]=blend(colors[0],tint[1],.16);colors[1]=blend(colors[1],tint[0],.36);colors[2]=blend(colors[2],tint[1],.2);colors[3]=blend(colors[3],tint[1],.5);}
    let atmosphere: number | null = recipe.kind === 'gas' ? 8 + Math.floor(rng() * 4) : rng() > .25 ? Math.floor(rng() * 24) : null;
    let clouds: number | null = atmosphere === null || recipe.kind === 'gas' ? null : Math.floor(rng() * 32);
    if (solar) { atmosphere = name === 'mercury' ? null : name === 'mars' ? 0 : name === 'earth' ? 1 : 8; clouds = name === 'earth' ? 0 : null; }
    const aurora = atmosphere !== null && rng() > .52 ? Math.floor(rng() * 16) : null;
    const rings = solar ? ['jupiter','saturn','uranus','neptune'].includes(name) : rng() < (recipe.kind === 'gas' ? .85 : .42);
    const inner = 1.22 + rng() * .7, outer = inner + .12 + rng() * 1.5;
    const ring = rings ? { recipe: Math.floor(rng() * 32), inner, outer, tilt: [Math.PI * (.2 + rng() * .5), rng() * .5, rng() * .8] as Triple,
      density: .28 + rng() * .5, tint: colors[2] } : null;
    if (solar && ring) {
      Object.assign(ring, name === 'saturn' ? { recipe: 10, inner: 1.23, outer: 2.32, density: .7, tint: '#d4c3a3', tilt: [1.1,0,.1] }
        : name === 'uranus' ? { recipe: 5, inner: 1.45, outer: 2.04, density: .38, tint: '#a6b7ba', tilt: [.15,.15,.5] }
        : { recipe: name === 'neptune' ? 12 : 17, inner: 1.45, outer: 1.85, density: .12, tint: '#9b9186' });
    }
    const objects = pick(32, usedObjects), layout = pick(48, usedLayouts), phenomenon = pick(32, usedPhenomena);
    const backdrop = { shape: rng() < .22 ? 0 : 2 + Math.floor(rng() * 10), warm: tint[0], cool: tint[1], density: .18 + rng() * .4, scale: 2.3 + rng() * 4.2, drift: .001 + rng() * .004 };
    if (body.id === 'sol/earth') Object.assign(backdrop, { shape: 1, warm: '#ad6256', cool: '#31768c', density: .48, scale: 5, drift: 0 });
    const profile: EnvironmentProfile = { version: ENVIRONMENT_VERSION, seed, signature: '', surface, variant, material, colors,
      geography: recipe.geography * (.85 + rng() * .3), warp: recipe.warp, clouds, atmosphere, aurora, ring, objects, layout,
      structure: rng() < .72 ? Math.floor(rng() * 24) : null, phenomenon, moonStyle: Math.floor(rng() * 24), moonOrbit: Math.floor(rng() * 12),
      moonCount: solar ? 0 : Math.floor(rng() * (recipe.kind === 'gas' ? 7 : 4)), zones: 2 + Math.floor(rng() * 5), backdrop,
      approachDirections:bodies.filter(other=>other.id!==body.id).map(other=>{
        const v=other.position.map((x,i)=>x-body.position[i]+(i===2?(other.radius-body.radius)*3:0));
        const length=Math.hypot(...v);return v.map(x=>Math.round(x/length*1e12)/1e12) as unknown as Triple;
      }) };
    profile.signature = `${surface}.${variant}.${MATERIALS[material].id}.${objects}.${layout}.${phenomenon}.${seed}`;
    return profile;
  });
}
