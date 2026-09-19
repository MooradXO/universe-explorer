import * as THREE from 'three';
import { OBJECTS } from './EnvironmentLibrary';

/** Shapes fit a unit sphere. Collision bounds are the same at both detail levels. */
export function objectGeometry(recipe:number,variant:number,low:boolean){
  const {shape,erosion}=OBJECTS[recipe];let g:THREE.BufferGeometry;
  switch(shape){
    case 1:g=new THREE.ConeGeometry(.48,2,5+variant%3,low?2:5);break;
    case 2:g=new THREE.BoxGeometry(1.7,.35,1.3,low?2:5,1,low?2:5);break;
    case 3:g=new THREE.OctahedronGeometry(1,low?0:1);break;
    case 4:g=new THREE.CylinderGeometry(.6,.9,.9,5+variant,1,false,0,Math.PI*(erosion===1?1.4:2));break;
    case 5:g=new THREE.TorusGeometry(.63,.32,low?5:8,low?9:16,erosion===1?4.2:Math.PI*2);break;
    case 6:g=new THREE.CylinderGeometry(.68,.95,1.7,6,low?3:7);break;
    default:g=new THREE.IcosahedronGeometry(1,low?1:2);
  }
  const pos=g.getAttribute('position');let max=0;
  for(let i=0;i<pos.count;i++){
    let x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const n=Math.sin(x*11+variant*1.7)*Math.cos(y*9+z*7),fine=Math.sin(x*23+z*29+y*17);
    let scale=.92+n*.1;
    if(erosion===1)scale*=y>.03?1:.66;
    if(erosion===2)scale*=1-.23*Math.max(0,fine)**4;
    if(erosion===3)scale*=.7+.3*Math.abs(Math.sin(y*4+x*2.8+variant));
    x*=scale;y*=scale;z*=scale;
    if(shape===7){x*=1.3;y*=.5+.5*Math.abs(x);z*=.55+.45*Math.abs(x);}
    if(shape===6){x*=.9+.12*Math.sin(y*17);z*=.9+.12*Math.sin(y*17);}
    if(variant===1)y*=1.7;
    if(variant===2){y*=.45;x*=1.25;}
    if(variant===3)x*=.7+Math.abs(y)*.7;
    if(variant===4){x+=Math.sign(x)*Math.max(0,y)*.55;z*=.65;}
    if(variant===5){x+=y*y*.6;z*=.7;}
    pos.setXYZ(i,x,y,z);max=Math.max(max,Math.hypot(x,y,z));
  }
  g.scale(1/max,1/max,1/max);g.computeVertexNormals();g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1.000001);return g;
}

/** 24 construction graphs; 8 variants change repetition, broken spans and appendage topology. */
export function landmarkGeometry(shape:number,variant:number){
  const segments:{kind:'box'|'ring'|'sphere';p:number[];s:number[];r:number[]}[]=[];
  const part=(kind:'box'|'ring'|'sphere',p:number[],s:number[],r=[0,0,0])=>segments.push({kind,p,s,r});
  const arm=(angle:number,length:number,y=0)=>part('box',[Math.cos(angle)*length*.5,y,Math.sin(angle)*length*.5],[length,8,12],[0,-angle,0]);
  const n=3+variant%4,span=150+variant*7;
  switch(shape){
    case 0:part('ring',[0,0,0],[span,span,span],[Math.PI/2,0,0]);for(let i=0;i<n;i++)arm(i*6.28/n,span);break;
    case 1:for(let i=0;i<n;i++){part('box',[0,i*24,0],[240,7,12]);part('box',[-80,i*24,38],[15,10,90]);part('box',[80,i*24,38],[15,10,90]);}break;
    case 2:part('box',[0,0,0],[12,220,12]);for(let i=0;i<n;i++)part('ring',[0,50-i*25,0],[70+i*10,70+i*10,70+i*10],[Math.PI/2,0,0]);break;
    case 3:for(let i=0;i<n;i++)part('box',[(i-(n-1)/2)*65,0,0],[58,130,3],[0,i*.15,0]);break;
    case 4:for(let i=0;i<n;i++)part('sphere',[(i%2)*65,Math.floor(i/2)*65,0],[36,36,60]);break;
    case 5:for(let i=0;i<n;i++){arm(i*6.28/n,170);part('sphere',[Math.cos(i*6.28/n)*170,0,Math.sin(i*6.28/n)*170],[25,40,25]);}break;
    case 6:part('sphere',[0,0,0],[65,65,65]);part('ring',[0,0,0],[130,130,130],[.4,0,.2]);part('box',[0,90,0],[12,100,12]);break;
    case 7:for(let i=0;i<n;i++){part('ring',[(i-(n-1)/2)*50,0,0],[60,60,60],[0,Math.PI/2,0]);}part('box',[0,0,0],[280,18,18]);break;
    case 8:for(let i=0;i<n;i++){const a=i/(n+1)*Math.PI*1.7;part('box',[Math.cos(a)*150,Math.sin(a)*150,0],[70,25,35],[0,0,a+Math.PI/2]);}break;
    case 9:for(let i=0;i<n*2;i++)part('box',[Math.cos(i)*45,(i-n)*26,Math.sin(i)*45],[90,12,22],[0,-i,0]);break;
    case 10:for(let i=0;i<3;i++){arm(i*2.094,200);part('box',[Math.cos(i*2.094)*160,30,Math.sin(i*2.094)*160],[90,10,65],[0,-i*2.094,0]);}break;
    case 11:for(let i=0;i<n;i++){arm(i*6.28/n,200);arm(i*6.28/n+.3,130,30);arm(i*6.28/n-.3,130,-30);}break;
    case 12:for(let i=0;i<n;i++)part('ring',[0,(i-(n-1)/2)*35,0],[130,130,130],[Math.PI/2,0,0]);break;
    case 13:for(const s of [-1,1]){part('sphere',[s*55,0,0],[25,150,25]);part('ring',[s*55,0,0],[65,65,65],[Math.PI/2,0,0]);}break;
    case 14:for(let i=0;i<n;i++){arm(i*6.28/n,150);part('ring',[Math.cos(i*6.28/n)*150,20,Math.sin(i*6.28/n)*150],[60,60,60],[1,0,i]);}break;
    case 15:for(let i=0;i<n*2;i++)part('box',[(i%n-n/2)*60,Math.floor(i/n)*80,0],[45,65,2],[.2,i*.16,.1]);break;
    case 16:for(let i=0;i<n;i++)part('sphere',[(i-(n-1)/2)*70,Math.sin(i)*25,0],[28,28,48]);break;
    case 17:part('box',[0,0,0],[260,12,12]);part('box',[0,0,0],[12,260,12]);for(let i=0;i<4;i++)part('ring',[Math.cos(i*1.57)*110,Math.sin(i*1.57)*110,0],[35,35,35]);break;
    case 18:for(let i=0;i<n;i++){const a=i*6.28/n;part('ring',[Math.cos(a)*65,Math.sin(a)*65,0],[65,65,65]);}break;
    case 19:for(let i=0;i<n;i++)part('box',[(i-n/2)*50,Math.sin(i*3)*18,0],[43,10,100],[0,0,i*.12]);break;
    case 20:for(let i=0;i<n*2;i++)part('ring',[0,(i-n)*20,0],[80,80,80],[Math.PI/2,0,0]);break;
    case 21:part('box',[0,0,0],[7,350,7]);for(let i=0;i<n;i++)part('sphere',[0,(i-(n-1)/2)*90,0],[35,20,35]);break;
    case 22:for(let i=0;i<n;i++){part('box',[(i-n/2)*50,(i-n/2)*40,0],[80,10,90]);part('box',[(i-n/2)*50,(i-n/2)*40+25,0],[8,50,8]);}break;
    case 23:for(let i=0;i<n*2;i++){const a=i/(n*2-1)*Math.PI;part('box',[Math.cos(a)*160,Math.sin(a)*160,0],[60,32,40],[0,0,a+Math.PI/2]);}break;
  }
  if(variant>=4)segments.splice(Math.floor(segments.length*.55),1);
  if(variant%2)part('box',[0,-65,0],[8,130,8]);
  if(variant%3===2)for(const sign of [-1,1])part('box',[sign*80,-55,0],[65,42,3],[0,sign*.4,0]);
  if(variant===3){part('box',[0,-75,70],[140,12,18]);for(const sign of [-1,1])part('box',[sign*65,-45,70],[8,60,8]);}
  if(variant===6)for(const sign of [-1,1])part('box',[sign*90,-35,15],[55,38,3],[.15,sign*.65,0]);
  return segments;
}
