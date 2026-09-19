import type { SpacePalette } from './SpaceMaterials';

/** User-approved cinematic direction. Geometry and scientific coordinates stay independent. */
export const CINEMATIC_STYLE:Readonly<SpacePalette> = Object.freeze({
  ocean:'#125274',land:'#77745a',coast:'#c4ad79',rim:'#55bdec',dust:'#ad6256',gas:'#31768c',
  fill:.10,glow:1.1,nebula:.58,
});
