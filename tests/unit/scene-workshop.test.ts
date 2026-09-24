import { describe,it,expect } from 'vitest';
import { ENTITY_TYPES,SCENE_FIELDS,createEntity,randomizeEntity,removeSceneEntity,emptyScene,sceneFromWorld,readScene,validateScene,sceneBody,type EntityKind } from '../../src/world/generation/SceneDocument';
import { SceneHistory } from '../../src/tools/environment-review/SceneHistory';
import { REVIEW_WORLDS } from '../../src/world/environments/EnvironmentReviewWorlds';
import { moonDescriptors } from '../../src/world/generation/MoonModel';

describe('whole scene recipes',()=>{
  it('round trips every supported type with transforms, visibility and every field',()=>{
    const scene=emptyScene();scene.entities=Object.keys(ENTITY_TYPES).map((kind,i)=>{const e=createEntity(kind as EntityKind,`object-${i}`);e.position=[i*100,-12,50];e.rotation=[12,34,56];e.scale=2;e.visible=i%2===0;return e;});
    const copy=readScene(JSON.stringify(scene));expect(copy).toEqual(scene);for(const e of copy.entities)expect(Object.keys(e.params)).toEqual(ENTITY_TYPES[e.kind].fields.map(f=>f.key));expect(Object.keys(copy.settings)).toEqual(SCENE_FIELDS.map(f=>f.key));
  });
  it('opens all 32 actual worlds as valid independent editable copies',()=>{
    const before=JSON.stringify(REVIEW_WORLDS);for(let i=0;i<32;i++){const scene=sceneFromWorld(i);expect(()=>validateScene(scene)).not.toThrow();const body=sceneBody(scene.entities[0],scene.settings);body.appearance.colors=['#ff0000'];expect(scene.entities[0].params.color0).not.toBe('#ff0000');}expect(JSON.stringify(REVIEW_WORLDS)).toBe(before);
  });
  it('keeps rings, moons, clouds, material and illumination together in the renderer input',()=>{
    const d=emptyScene(),e=createEntity('planet','planet');Object.assign(e.params,{ring:10,ringInner:1.5,ringOuter:3,ringTilt:45,ringTurn:30,ringDensity:.8,moons:7,moonStyle:5,moonOrbit:3,moonDistance:2,moonSize:1.5,clouds:12,cloudCoverage:.8,atmosphere:4,aurora:6,surface:24,geology:7,roughness:.2,texture:'',cloudSpeed:.02});
    d.entities=[e];const body=sceneBody(readScene(JSON.stringify(d)).entities[0],d.settings);
    expect(body.appearance.ring).toMatchObject({recipe:10,inner:1.5,outer:3,density:.8});expect(body.appearance.ring!.tilt[0]).toBeCloseTo(Math.PI/4);expect(body.appearance.editor).toMatchObject({geology:7,roughness:.2,cloudCoverage:.8,cloudSpeed:.02});expect(body.appearance.clouds).toBe(12);expect(body.appearance.aurora).toBe(6);expect(moonDescriptors(body)).toHaveLength(7);
    const originalRadius=moonDescriptors(body)[0].radius;body.environment.editor!.moonSize=1;expect(moonDescriptors(body)[0].radius).toBeCloseTo(originalRadius/1.5);
  });
  it('rejects unsafe or broken imports before any document is replaced',()=>{
    const scene=sceneFromWorld(4),breakers=[(d:any)=>d.entities.push(structuredClone(d.entities[0])),(d:any)=>d.entities[0].params.ringOuter=.5,(d:any)=>d.entities[0].params.clouds=999,(d:any)=>d.entities[0].position[0]=Infinity,(d:any)=>d.entities[0].kind='__proto__',(d:any)=>d.entities[0].params.color0='url(https://example.com)',(d:any)=>d.entities[0].params.seed='x'.repeat(100),(d:any)=>d.version=2,(d:any)=>d.settings.exposure=100];
    for(const breakIt of breakers){const d=structuredClone(scene);breakIt(d);expect(()=>validateScene(d)).toThrow();}
    expect(()=>readScene(' '.repeat(512001))).toThrow();const limit=emptyScene();for(let i=0;i<7;i++)limit.entities.push(createEntity('planet',`planet-${i}`));expect(()=>validateScene(limit)).toThrow(/6/);
  });
  it('migrates the previous seed-only export',()=>{const d=readScene(JSON.stringify({version:1,seed:'test',preset:'gas',geography:6,activity:.8}));expect(d.entities).toHaveLength(1);expect(d.entities[0].params.geography).toBe(6);expect(()=>validateScene(d)).not.toThrow();});
  it('preserves authored satellites, rejects hierarchy cycles and removes a whole branch',()=>{
    const d=sceneFromWorld(4);expect(d.entities).toHaveLength(5);expect(d.entities.slice(1).every(e=>e.parent==='planet-1')).toBe(true);d.entities[0].parent=d.entities[1].id;expect(()=>validateScene(d)).toThrow(/cycle/);d.entities[0].parent=null;removeSceneEntity(d,'planet-1');expect(d.entities).toHaveLength(0);
  });
  it('generates reproducible complete variants without breaking unrelated objects',()=>{
    for(const kind of Object.keys(ENTITY_TYPES) as EntityKind[]){const a=createEntity(kind,'item'),b=structuredClone(a);randomizeEntity(a,'repeatable');randomizeEntity(b,'repeatable');expect(a).toEqual(b);const d=emptyScene();d.entities=[a];expect(()=>validateScene(d)).not.toThrow();}
  });
  it('undoes combined edits and deletion, redo clears after branching and history owns copies',()=>{
    const initial=sceneFromWorld(8),h=new SceneHistory(initial),next=structuredClone(initial);next.entities[0].params.ringDensity=.9;next.entities.push(createEntity('field','field'));h.commit(next);next.entities=[];expect(h.current.entities).toHaveLength(2);h.commit(emptyScene());expect(h.undo()).toBe(true);expect(h.current.entities).toHaveLength(2);expect(h.undo()).toBe(true);expect(h.current).toEqual(initial);expect(h.redo()).toBe(true);h.commit(emptyScene());expect(h.canRedo).toBe(false);
  });
});
