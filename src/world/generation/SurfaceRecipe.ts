import type { SystemBody } from '../systems/SystemDescriptor';
import { SURFACES } from '../environments/EnvironmentLibrary';
import type { SurfaceRecipe } from './SurfaceBake';
export function surfaceRecipe(body:SystemBody):SurfaceRecipe {
  return {seed:body.appearance.seed,kind:SURFACES[body.appearance.surface].kind,geography:body.appearance.geography,activity:body.model.activity,ice:body.model.polarIce};
}
