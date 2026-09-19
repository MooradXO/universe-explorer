import * as THREE from 'three';
import { vertexShader, fragmentShader } from './shaders.js';

export function makeMaterial(library,id,options={}) {
  const spec=library.resources.materials[id]||{};
  const powerbox=spec.shaderName?.includes('Powerbox'),props=spec.properties||{},slots=spec.textureSlots||{},to4=o=>new THREE.Vector4(o?.r??0,o?.g??0,o?.b??0,o?.a??0),bg=slots._Background||{};
  const mat=new THREE.ShaderMaterial({
    vertexShader,fragmentShader,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{map:{value:library.textures.get(spec.map)||library.white},tint:{value:new THREE.Vector4(...(spec.color||[1,1,1,1]))},intensity:{value:1},lit:{value:powerbox&&!spec.shaderName.includes('Unlit')?1:options.lit?1:0},
      recolor:{value:new THREE.Color(1,1,1)},colorize:{value:0},powerbox:{value:powerbox?1:0},iconMap:{value:library.textures.get(slots._Icon?.map)||library.white},backgroundMap:{value:library.textures.get(bg.map)||library.white},iconTint:{value:to4(props._IconTint)},backgroundTint:{value:to4(props._BackgroundTint||{r:1,g:1,b:1,a:1})},backgroundST:{value:new THREE.Vector4(...(bg.scale||[1,1]),...(bg.offset||[0,0]))},iconSettings:{value:new THREE.Vector4(props._IconScale??2,props._IconContrast??1,props._IconBrightness??1,0)},iconOffset:{value:new THREE.Vector2(props._IconOffset?.r||0,props._IconOffset?.g||0)},backgroundSettings:{value:new THREE.Vector2(props._BackgroundContrast??1,props._BackgroundBrightness??1)},surfaceSettings:{value:new THREE.Vector2(props._Smoothness||0,props._Metallic||0)},
      sceneDepth:{value:library.white},viewport:{value:new THREE.Vector2(1,1)},cameraRange:{value:new THREE.Vector2(.1,100)},softRange:{value:new THREE.Vector2(props._SoftParticlesNearFadeDistance||0,props._SoftParticlesFarFadeDistance||.3)},useSoftDepth:{value:0},
      renderMode:{value:options.mode||0},alignment:{value:options.alignment||0},lengthScale:{value:options.lengthScale??1},velocityScale:{value:options.velocityScale||0},
      tiles:{value:new THREE.Vector2(...(options.tiles||[1,1]))},uvScale:{value:new THREE.Vector2(...(spec.scale||[1,1]))},uvOffset:{value:new THREE.Vector2(...(spec.offset||[0,0]))},pivot:{value:new THREE.Vector3(...(options.pivot||[0,0,0]))}},
  });
  mat.blending=THREE.CustomBlending;mat.blendEquation=THREE.AddEquation;
  const factors={0:THREE.ZeroFactor,1:THREE.OneFactor,2:THREE.DstColorFactor,3:THREE.SrcColorFactor,4:THREE.OneMinusDstColorFactor,5:THREE.SrcAlphaFactor,6:THREE.OneMinusSrcColorFactor,7:THREE.DstAlphaFactor,8:THREE.OneMinusDstAlphaFactor,9:THREE.SrcAlphaSaturateFactor,10:THREE.OneMinusSrcAlphaFactor};
  mat.blendSrc=factors[spec.srcBlend??5];mat.blendDst=factors[spec.dstBlend??10];
  mat.blendSrcAlpha=THREE.OneFactor;mat.blendDstAlpha=THREE.OneMinusSrcAlphaFactor;
  if(powerbox){mat.blending=THREE.NormalBlending;mat.depthWrite=true;mat.side=THREE.FrontSide;}
  mat.userData.soft=!!spec.soft&&!powerbox;
  mat.userData.baseTint=mat.uniforms.tint.value.clone();
  return mat;
}
export class ParticleBatch {
  constructor(emitter,library,baseGeometry){
    this.emitter=emitter;const e=emitter.definition,rd=e.renderer,uv=e.modules.UVModule;
    this.geometry=new THREE.InstancedBufferGeometry();
    for(const name of ['position','normal','uv'])this.geometry.setAttribute(name,baseGeometry.getAttribute(name));
    this.geometry.setIndex(baseGeometry.index);
    this.attributes={};
    for(const [key,size] of Object.entries({fxPosition:3,fxSize:3,fxQuaternion:4,fxColor:4,fxVelocity:3,fxAngle:1,fxFrame:1})){
      const a=new THREE.InstancedBufferAttribute(new Float32Array(emitter.capacity*size),size);a.setUsage(THREE.DynamicDrawUsage);this.geometry.setAttribute(key,a);this.attributes[key]=a;
    }
    this.material=makeMaterial(library,rd.materials[0],{mode:rd.m_RenderMode,alignment:rd.m_RenderMode===4?0:(rd.m_RenderAlignment===1?1:0),lengthScale:rd.m_LengthScale,velocityScale:rd.m_VelocityScale,tiles:uv?[uv.tilesX||1,uv.tilesY||1]:[1,1],pivot:[rd.m_Pivot?.x||0,rd.m_Pivot?.y||0,-(rd.m_Pivot?.z||0)],lit:rd.m_RenderMode===4&&!library.resources.materials[rd.materials[0]]?.dstBlend});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=1-(rd.m_SortingFudge||0)*.01;this.geometry.instanceCount=0;
    emitter.fx.group.add(this.mesh);
  }
  write(i,p,size,q,c,velocity,angle,frame){
    const a=this.attributes;a.fxPosition.setXYZ(i,p.x,p.y,p.z);a.fxSize.setXYZ(i,...size);a.fxQuaternion.setXYZW(i,q.x,q.y,q.z,q.w);a.fxColor.setXYZW(i,...c);a.fxVelocity.setXYZ(i,velocity.x,velocity.y,velocity.z);a.fxAngle.setX(i,angle);a.fxFrame.setX(i,frame);
  }
  finish(count){this.geometry.instanceCount=count;for(const a of Object.values(this.attributes)){a.clearUpdateRanges();if(count)a.addUpdateRange(0,count*a.itemSize);a.needsUpdate=true;}}
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
const trailVertex=`attribute vec4 fxColor; varying vec4 vColor; varying vec2 vUv; void main(){vColor=fxColor;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const trailFragment=`uniform sampler2D map;uniform vec4 tint;uniform float intensity;uniform vec3 recolor;uniform float colorize;varying vec4 vColor;varying vec2 vUv;void main(){vec4 c=texture2D(map,vUv)*vColor*tint;if(c.a<.001)discard;if(colorize>.5)c.rgb=recolor*dot(c.rgb,vec3(.2126,.7152,.0722))/max(.08,dot(recolor,vec3(.2126,.7152,.0722)));gl_FragColor=vec4(c.rgb*intensity,c.a);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export class TrailBatch {
  constructor(emitter,library){
    this.emitter=emitter;this.max=24000;this.geometry=new THREE.BufferGeometry();
    for(const [n,s] of [['position',3],['fxColor',4],['uv',2]])this.geometry.setAttribute(n,new THREE.BufferAttribute(new Float32Array(this.max*s),s).setUsage(THREE.DynamicDrawUsage));
    this.material=makeMaterial(library,emitter.definition.renderer.materials[1]||emitter.definition.renderer.materials[0]);this.material.vertexShader=trailVertex;this.material.fragmentShader=trailFragment;
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.renderOrder=2;emitter.fx.group.add(this.mesh);this.count=0;
  }
  reset(){this.count=0;}
  segment(a,b,widthA,widthB,colorA,colorB,eye,u0,u1){
    if(this.count+6>this.max)return;
    const dir=new THREE.Vector3().subVectors(b,a),side=new THREE.Vector3().subVectors(eye,a).cross(dir).normalize();
    if(side.lengthSq()<.001)side.set(1,0,0);
    const a0=a.clone().addScaledVector(side,widthA*.5),a1=a.clone().addScaledVector(side,-widthA*.5),b0=b.clone().addScaledVector(side,widthB*.5),b1=b.clone().addScaledVector(side,-widthB*.5);
    const pts=[a0,a1,b0,b0,a1,b1],cs=[colorA,colorA,colorB,colorB,colorA,colorB],uvs=[[u0,0],[u0,1],[u1,0],[u1,0],[u0,1],[u1,1]];
    for(let j=0;j<6;j++){const i=this.count++;this.geometry.attributes.position.setXYZ(i,pts[j].x,pts[j].y,pts[j].z);this.geometry.attributes.fxColor.setXYZW(i,...cs[j]);this.geometry.attributes.uv.setXY(i,...uvs[j]);}
  }
  finish(){this.geometry.setDrawRange(0,this.count);for(const a of Object.values(this.geometry.attributes)){a.clearUpdateRanges();if(this.count)a.addUpdateRange(0,this.count*a.itemSize);a.needsUpdate=true;}}
  dispose(){this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
