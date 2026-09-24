import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Client,type Room} from '@colyseus/sdk';
import {startServer} from '../../server/index';
import {NET,type WorldSnapshot} from '../../src/network/shared/Protocol';
import {WorldDecoder} from '../../src/network/shared/WorldCodec';
import {GENERATOR} from '../../src/world/generation/GeneratorContract';
import {SOLAR_SYSTEM,bodyArrival} from '../../src/world/systems/SystemDescriptor';
import {explorationSites} from '../../src/world/generation/ExplorationSites';
import {physicsFingerprint} from '../../src/world/generation/SystemPhysics';
const root='docs/phases_archive/generator-foundation-2026-09-24/network';await mkdir(root,{recursive:true});
const running=await startServer({port:2577,store:null,allowBots:false}),rooms:Room[]=[],results:unknown[]=[];
const endpoint='http://127.0.0.1:2577';
async function until(check:()=>boolean,timeout=12000){const start=Date.now();while(!check()){if(Date.now()-start>timeout)throw Error('Network condition timeout');await new Promise(r=>setTimeout(r,30));}}
try{
  for(const generator of [undefined,GENERATOR]){
    const room=await new Client(endpoint).joinById(NET.roomId,{version:NET.version,username:'GeneratorCheck',generator});rooms.push(room);
    const decoder=new WorldDecoder();let state:WorldSnapshot|undefined,versions:unknown;
    room.onMessage('*',(type,data)=>{if(type==='arrival')decoder.reset();if(type==='world')state=decoder.decode(data);if(type==='welcome')versions=data.generator;});
    await until(()=>!!state);assert.deepEqual(versions,GENERATOR);
    const id=state!.self.id,pilot=running.room.game.pilots.get(id)!,body=SOLAR_SYSTEM.bodies[2],site=explorationSites(SOLAR_SYSTEM).find(s=>s.bodyId===body.id)!;
    pilot.position.fromArray(bodyArrival(body));pilot.model.resetMotion();
    running.server.simulateLatency(240);room.send('cruise',{target:site.id,epoch:pilot.epoch});await until(()=>pilot.cruise===site.id);
    await until(()=>pilot.cruise===null,45000);assert.match(pilot.travelStatus,/Destination reached/);assert.ok(Math.hypot(...pilot.position.toArray().map((v,i)=>v-site.approach[i]))<1);
    const fingerprint=physicsFingerprint(running.room.game.systems.get(pilot.systemId)!.descriptor);assert.equal(fingerprint,physicsFingerprint(SOLAR_SYSTEM));
    results.push({legacy:!generator,versions,site:site.id,status:pilot.travelStatus,fingerprint,rttMs:240});running.server.simulateLatency(0);await room.leave();
    await until(()=>!running.room.game.pilots.has(id));
  }
  await assert.rejects(()=>new Client(endpoint).joinById(NET.roomId,{version:NET.version,username:'Incompatible',generator:{...GENERATOR,physics:2}}));
  results.push({incompatiblePhysicsRejected:true});
}finally{await writeFile(`${root}/evidence.json`,JSON.stringify({results},null,2));for(const room of rooms)if(room.connection.isOpen)await room.leave();await running.close();}
console.log(JSON.stringify({cases:results.length,result:'PASS'}));process.exit(0);
