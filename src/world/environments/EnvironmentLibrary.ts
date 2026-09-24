/** Authored structural recipes. Palette changes never create another family. */
export const ENVIRONMENT_VERSION = 1;
export const SURFACE_GROUPS = [
  ["Crater seas","Rayed craters","Basin chains","Ancient regolith","Canyons","Mesas","Dune seas","Folded ridges","Fractured crust","Terraced basins","Erosion channels","Polar deserts","Basalt plains","Rift valley","Layered highlands","Rock islands"],
  ["Lava seas","Calderas","Lava rivers","Fiery fault network","Shield volcanoes","Cooling crust","Fiery crescent","Volcanic archipelago"],
  ["Ice plates","Banded ice","Frozen basins","Fracture web","Polar cover","Ice ridges","Dark glacier","Cryovolcanic plains"],
  ["Continents","Archipelagos","Ocean atolls","Divided oceans","Polar seas","Flooded valleys","Supercontinent","Shallow-water labyrinths"],
  ["Salt crusts","Iron-rich layers","Glassy plains","Mineral veins","Crystalline basins","Obsidian ridges","Sulphur fields","Bright terraces"],
  ["Broad gas bands","Narrow jet belts","Giant cyclone","Storm chain","Polar vortex","Cloud waves","Double vortex","Dark gaps","Soft cloud shell","High-altitude plumes","Turbulent ribbons","Contrasting equatorial jets","Broken bands","Storm knots","Zonal steps","Spiral clouds"],
] as const;
export type SurfaceKind = 'rock' | 'lava' | 'ice' | 'ocean' | 'mineral' | 'gas';
const kinds: SurfaceKind[] = ['rock','lava','ice','ocean','mineral','gas'];
const colors = [
  ['#313039','#8e7965','#c1af91','#849eac'], ['#171921','#653c35','#ce8254','#d78160'],
  ['#294b62','#91b7c2','#e2e9dd','#8bcce0'], ['#0d354e','#486954','#bbba83','#83bfe0'],
  ['#26343a','#917c68','#dfc78a','#c5c9a2'], ['#393a55','#9b907e','#d7cbb2','#adc7dc'],
];
export const SURFACES = SURFACE_GROUPS.flatMap((names, group) => names.map((name, shape) => ({
  id: `${kinds[group]}-${shape}`, name, kind: kinds[group], group, shape,
  colors: colors[group], geography: 2.1 + (shape % 4) * 1.7, warp: .12 + (shape % 3) * .23,
  relief: group === 5 ? 0 : .07 + (shape % 5) * .035,
  oceanLevel: group === 3 ? [.49,.39,.34,.54,.47,.57,.62,.46][shape] : 0,
  texture: group === 5 ? 'clouds' : group === 2 ? 'ice' : group === 0 ? 'regolith' : 'mineral',
}))) ;
// Two physically different surface treatments per recipe: exposed and coated.
export const MATERIALS = SURFACES.flatMap((surface, i) => [0,1].map(treatment => ({
  id: `${surface.id}-${treatment ? 'coated' : 'exposed'}`, surface: i, treatment,
  roughness: treatment ? .36 + (i % 5) * .09 : .68 + (i % 4) * .08,
  grain: treatment ? 42 + (i % 7) * 13 : 100 + (i % 9) * 17,
  relief: surface.relief * (treatment ? .55 : 1), coverage: treatment ? .6 : .22,
})));
export const CLOUD_SHAPES = ["Fronts","Cyclones","Cirrus filaments","Cloud cells","Latitude belts","Polar caps","Broken cover","Layered veil"] as const;
export const CLOUDS = CLOUD_SHAPES.flatMap((name, shape) => ["Single layer","Two opposing layers","Altitude shear","Dissolving fronts"].map((layer, stack) => ({
  id: `${shape}-${stack}`, name: `${name} · ${layer}`, shape, stack, coverage: .22 + stack * .14,
  scale: 3.4 + shape * .65, speed: .003 + stack * .002, altitude: .006 + stack * .003,
})));
export const ATMOSPHERES = ["Thin","Dusty","Dense","Icy","High-altitude","Layered"].flatMap((name, type) => [0,1,2,3].map(layer => ({
  id: `${type}-${layer}`, name: `${name} shell ${layer + 1}`, type, layer,
  thickness: [.013,.027,.045,.019,.06,.033][type] * (1 + layer * .18),
  density: [.2,.42,.64,.28,.16,.5][type] + layer * .05, falloff: 2.8 + layer * .8,
})));
export const AURORAS = ["Oval","Curtain","Coronal rays","Broken arcs","Double belt","Drifting spots","Spiral","Magnetic filaments"]
  .flatMap((name, shape) => [0,1].map(mode => ({ id: `${shape}-${mode}`, name: `${name} ${mode + 1}`, shape, mode })));
export const RINGS = ["Solid belt","Thin strands","Separated belts","Arcs","Dust disc","Double ring","Density waves","Fragments"]
  .flatMap((name, shape) => [0,1,2,3].map(layer => ({ id: `${shape}-${layer}`, name: `${name} ${layer + 1}`, shape, layer,
    inner: 1.25 + layer * .17, outer: 1.7 + layer * .42 + (shape % 3) * .3, bands: 1 + layer * 2 })));
export const OBJECT_SHAPES = ["Boulders","Ice needles","Slabs","Crystals","Metal fragments","Porous debris","Layered rocks","Binary bodies"] as const;
export const OBJECTS = OBJECT_SHAPES.flatMap((name, shape) => ["Solid","Split","Weathered","Fused"].map((form, erosion) => ({
  id: `${shape}-${erosion}`, name: `${name} · ${form}`, shape, erosion, variants: 6,
  material: [0x72716d,0x87bdc7,0x9b7760,0x9fbcc4,0x728491,0x74695c,0x9a826a,0x606a71][shape],
  roughness: [.95,.25,.86,.18,.42,1,.9,.75][shape], metalness: shape === 4 ? .72 : .04,
})));
export const LAYOUT_SHAPES = ["Arc","Double cluster","Vertical wall","Broken torus","Spiral","Stream","Spherical shell","Sparse giants","Branches","Funnel","Wave sheet","Island chain"] as const;
export const LAYOUTS = LAYOUT_SHAPES.flatMap((name, shape) => ["Open","Segmented","Multilevel","Branched"].map((form, pattern) => ({
  id: `${shape}-${pattern}`, name: `${name} · ${form}`, shape, pattern,
})));
export const STRUCTURES = ["Orbital crown","Shipyard","Radio beacon","Sail lattice","Storage","Anchor cluster","Observatory","Processing hub",
  "Broken gate","Helical tower","Triple dock","Branched collector","Ring truss","Double spindle","Antenna network","Mirror array",
  "Capsule convoy","Cross relay","Honeycomb complex","Broken berth","Magnetic coil","Tether station","Platform cascade","Memory arch"]
  .map((name, shape) => ({ id: String(shape), name, shape, variants: 8 }));
export const PHENOMENA = ["Resonance","Plasma jet","Particle vortex","Radio echo","Magnetic filaments","Dust wave","Lens","Cryo-ejection"]
  .flatMap((name, shape) => ["Pulsing","Orbital","Travelling wave","Split"].map((form, behavior) => ({
    id: `${shape}-${behavior}`, name: `${name} · ${form.toLowerCase()}`, shape, behavior,
    period: 3 + behavior * 1.4 + shape * .21,
  })));
export const MOONS = ["Impact","Icy","Fractured","Volcanic","Mineral","Captured boulder","Oceanic","Banded"]
  .flatMap((name, type) => [0,1,2].map(shape => ({ id: `${type}-${shape}`, name: `${name} moon ${shape + 1}`, type, shape })));
export const MOON_ORBITS = ["Single","Pair","Chain","Resonant","Inclined","Polar","Inner and outer","Sparse","Retrograde","Fan","Two planes","Ring moons"];
export const BACKDROP_SHAPES = ["Clear space","Familiar cloud bands","Separate clouds","Thin strands","Broad dust band","Arc","Rift","Filaments","Ring haze","Scattered patches","Spiral arm","Wave front"];
export const LIBRARY_COUNTS = Object.freeze({ surfaces: SURFACES.length, materials: MATERIALS.length, clouds: CLOUDS.length,
  atmospheres: ATMOSPHERES.length, auroras: AURORAS.length, rings: RINGS.length, objects: OBJECTS.length,
  objectForms: OBJECTS.length * 6, layouts: LAYOUTS.length, structures: STRUCTURES.length,
  structureVariants: STRUCTURES.length * 8, phenomena: PHENOMENA.length, moons: MOONS.length, moonOrbits: MOON_ORBITS.length,
  backdrops: BACKDROP_SHAPES.length });
