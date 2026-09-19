import { ENVIRONMENT_FX_PRESETS } from './EnvironmentFXPresets';
import { PHENOMENA } from './EnvironmentLibrary';
import type { OrbitalZone } from '../systems/OrbitalSite';

/** Authored particles carry every phenomenon. Epic presets supply an optional second layer. */
export function environmentFX(zone:OrbitalZone){
  const seed=zone.profile.seed+zone.index*117;
  if(seed%5===0)return null;
  const family=PHENOMENA[zone.phenomenon].shape,options=ENVIRONMENT_FX_PRESETS.filter(e=>e.family===family);
  const preset=options[(Math.floor(seed/11)+zone.profile.variant)%options.length];
  return {...preset,seed,color:family%2?zone.profile.backdrop.warm:zone.profile.backdrop.cool,
    size:[1.1,.7,1.1,1.2,.9,1.2,1.3,1.1][family],units:[180,110,160,140,150,170,180,140][family]};
}
