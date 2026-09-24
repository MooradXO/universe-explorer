/** Packed linear data: R macro height, G fine height, B roughness, A reflective mask. */
export interface SurfaceRecipe { seed:number; kind:string; geography:number; activity:number; ice:number; }
export interface SurfaceBake { width:number; height:number; pixels:Uint8Array<ArrayBuffer>; }
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function hash(x:number,y:number,z:number,seed:number){let n=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647)^seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
function noise(x:number,y:number,z:number,seed:number){
  const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z);let fx=x-ix,fy=y-iy,fz=z-iz;
  fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);fz=fz*fz*(3-2*fz);
  let value=0;for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let c=0;c<2;c++)value+=hash(ix+a,iy+b,iz+c,seed)*(a?fx:1-fx)*(b?fy:1-fy)*(c?fz:1-fz);return value;
}
export function sampleSurface(recipe:SurfaceRecipe,x:number,y:number,z:number):readonly number[]{
  let macro=0,fine=0,amp=.54,f=Math.max(1,recipe.geography*.7);
  for(let octave=0;octave<7;octave++){const n=noise(x*f+17,y*f+7,z*f+23,recipe.seed);if(octave<4)macro+=n*amp;else fine+=n*(octave===4?.57:octave===5?.28:.15);amp*=.48;f*=2.07;}
  let rough=.68,reflect=.05;
  if(recipe.kind==='gas'){macro=.5+Math.sin(y*38+macro*6)*.12+macro*.15;rough=.92;reflect=.02;}
  if(recipe.kind==='ice'){macro=macro*.7+Math.abs(macro-.45)*.45;rough=.25+fine*.4;reflect=.3;}
  if(recipe.kind==='ocean'){const water=clamp((.5-macro)*35);rough=.75*(1-water)+.06*water;reflect=water*.85;}
  if(recipe.kind==='mineral'){rough=.28+fine*.5;reflect=.18+Math.pow(fine,3)*.35;}
  if(recipe.kind==='lava'){rough=.88;macro+=Math.sin(macro*35)*.025*recipe.activity;}
  return [clamp(macro),clamp(fine),clamp(rough),clamp(reflect)];
}
export function createSurfaceBake(width:number):SurfaceBake {
  if(![64,128,256,512].includes(width))throw new Error('Unsupported surface size');
  return {width,height:width/2,pixels:new Uint8Array(width*width/2*4)};
}
/** Rows are independent: workers and the bounded fallback produce identical bytes. */
export function bakeSurfaceRows(recipe:SurfaceRecipe,bake:SurfaceBake,start:number,end:number){
  for(let y=start;y<Math.min(end,bake.height);y++){
    const latitude=y/(bake.height-1)*Math.PI,sy=Math.cos(latitude),radial=Math.sin(latitude);
    for(let x=0;x<bake.width;x++){
      const longitude=x/(bake.width-1)*Math.PI*2;
      // Duplicate seam texels and collapse the poles, without UV-dependent noise.
      const v=sampleSurface(recipe,-Math.cos(longitude)*radial,sy,Math.sin(longitude)*radial),offset=(y*bake.width+x)*4;
      for(let i=0;i<4;i++)bake.pixels[offset+i]=Math.round(v[i]*255);
    }
  }
}
