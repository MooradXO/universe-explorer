import * as T from 'three';
/** Common appearance of live combat impacts and workshop effects. */
export function impactMaterial(kind:'explosion'|'shield'|'sparks',color:number,texture?:T.Texture){
  if(kind==='sparks')return new T.PointsMaterial({color,size:20,map:texture,transparent:true,opacity:1,blending:T.AdditiveBlending,depthWrite:false,sizeAttenuation:true,toneMapped:false});
  return new T.MeshBasicMaterial({color,transparent:true,opacity:kind==='shield'?.7:1,wireframe:kind==='shield',toneMapped:false});
}
