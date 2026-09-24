import {expect,it} from 'vitest';
import {GENERATOR_PRESETS,readGeneratorRecipe,recipeBody} from '../../src/world/generation/GeneratorRecipe';
import {REVIEW_SYSTEMS} from '../../src/world/environments/EnvironmentReviewWorlds';
import {SURFACES} from '../../src/world/environments/EnvironmentLibrary';
it('round-trips editor recipes and produces repeatable previews without mutating the game',()=>{
  const system=REVIEW_SYSTEMS[0],body=system.bodies[2],before=JSON.stringify(system);
  for(const preset of GENERATOR_PRESETS){const r={version:1 as const,seed:'A < B 🌌',preset,geography:4,activity:.65};expect(readGeneratorRecipe(JSON.stringify(r))).toEqual(r);
    const a=recipeBody(body,system.model,r),b=recipeBody(body,system.model,r);expect(a).toEqual(b);expect(a.id).not.toBe(body.id);
    if(preset!=='automatic')expect(SURFACES[a.appearance.surface].kind).toBe(preset);
    expect(a.appearance.seed).not.toBe(recipeBody(body,system.model,{...r,seed:'another'}).appearance.seed);
  }expect(JSON.stringify(system)).toBe(before);
});
it('rejects malformed, unsupported, oversized and unbounded recipes before allocating renderer resources',()=>{
  const r={version:1,seed:'test',preset:'ice',geography:4,activity:.6};
  for(const changes of [{version:2},{seed:''},{seed:'x'.repeat(97)},{preset:'__proto__'},{geography:1e10},{activity:-1},{geography:null}])expect(readGeneratorRecipe(JSON.stringify({...r,...changes}))).toBeNull();
  expect(readGeneratorRecipe('{bad')).toBeNull();expect(readGeneratorRecipe(' '.repeat(4097))).toBeNull();
});
