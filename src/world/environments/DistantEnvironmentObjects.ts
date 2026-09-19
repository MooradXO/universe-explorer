import * as THREE from 'three';
import {OBJECTS} from './EnvironmentLibrary';
import {SPACE_ENVIRONMENT} from './SpaceEnvironment';
import type {OrbitalZone} from '../systems/OrbitalSite';
import type {FloatingOrigin} from '../space/FloatingOrigin';
import {worldPosition} from '../space/WorldPosition';

/** Real coarse silhouettes with normal lighting; eight batches for the entire visible region. */
export class DistantEnvironmentObjects {
  readonly group=new THREE.Group();
  private batches:{mesh:THREE.InstancedMesh;geometry:THREE.BufferGeometry;detail:THREE.InstancedBufferAttribute}[]=[];
  private material:THREE.MeshLambertMaterial;
  private focus={value:new THREE.Vector3()};
  private ranges=new Map<string,{batch:number;index:number}[]>();
  private capacity=1024;
  count=0;
  constructor(){
    this.material=new THREE.MeshLambertMaterial({transparent:true,depthWrite:false});
    this.material.onBeforeCompile=shader=>{
      shader.uniforms.environmentFocus=this.focus;
      shader.vertexShader='attribute float environmentDetail;uniform vec3 environmentFocus;varying float environmentFade;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        vec3 environmentPosition=(modelMatrix*instanceMatrix*vec4(position,1.)).xyz;
        environmentFade=(1.-environmentDetail)*(1.-smoothstep(${SPACE_ENVIRONMENT.farRange*.65}.,${SPACE_ENVIRONMENT.farRange}.,length(environmentPosition-environmentFocus)));`);
      shader.fragmentShader='varying float environmentFade;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`diffuseColor.a*=environmentFade;if(diffuseColor.a<.008)discard;\n#include <opaque_fragment>`);
    };
    this.material.customProgramCacheKey=()=> 'interplanetary-coarse-v1';
    const geometries=[new THREE.IcosahedronGeometry(1,0),new THREE.ConeGeometry(.4,2,4),new THREE.BoxGeometry(1.5,.3,1),new THREE.OctahedronGeometry(1,0),
      new THREE.CylinderGeometry(.45,.7,1.4,4),new THREE.IcosahedronGeometry(1,0),new THREE.BoxGeometry(1.4,.6,1.1),new THREE.OctahedronGeometry(1,0)];
    for(const geometry of geometries){
      const detail=new THREE.InstancedBufferAttribute(new Float32Array(this.capacity),1);detail.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('environmentDetail',detail);
      const mesh=new THREE.InstancedMesh(geometry,this.material,this.capacity);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;
      this.batches.push({mesh,geometry,detail});this.group.add(mesh);
    }
  }
  setFields(fields:OrbitalZone[],origin:FloatingOrigin,opacity:(id:string)=>number){
    for(const {mesh} of this.batches)mesh.count=0;this.ranges.clear();this.count=0;
    const object=new THREE.Object3D(),color=new THREE.Color();
    for(const field of fields){
      const kind=OBJECTS[field.objects].shape,batch=this.batches[kind],local=origin.toLocal(worldPosition(undefined,field.center)),ranges:{batch:number;index:number}[]=[];
      color.setHex(OBJECTS[field.objects].material);const fade=opacity(field.id);
      for(const rock of field.rocks){
        const index=batch.mesh.count;if(index>=this.capacity)break;
        object.position.set(local[0]+rock.offset[0],local[1]+rock.offset[1],local[2]+rock.offset[2]);object.rotation.set(...rock.rotation);object.scale.setScalar(rock.radius);object.updateMatrix();
        batch.mesh.setMatrixAt(index,object.matrix);batch.mesh.setColorAt(index,color);batch.detail.setX(index,fade);batch.mesh.count++;this.count++;
        ranges.push({batch:kind,index});
      }
      this.ranges.set(field.id,ranges);
    }
    for(const {mesh,detail} of this.batches){mesh.visible=mesh.count>0;mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;detail.needsUpdate=true;}
  }
  setDetail(id:string,opacity:number){for(const {batch,index} of this.ranges.get(id)??[]){const detail=this.batches[batch].detail;detail.setX(index,opacity);detail.needsUpdate=true;}}
  update(focus:THREE.Vector3){this.focus.value.copy(focus);}
  dispose(){for(const {geometry,mesh} of this.batches){mesh.dispose();geometry.dispose();}this.material.dispose();this.group.removeFromParent();this.group.clear();}
}
