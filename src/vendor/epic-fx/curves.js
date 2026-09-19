export const clamp = (x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const mix=(a,b,t)=>a+(b-a)*t;
export function hermite(keys,t) {
  if(!keys?.length)return 1;
  if(t<=keys[0][0])return keys[0][1];
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
    const a=keys[i-1],b=keys[i],d=b[0]-a[0];
    if(!d)return b[1]; if(a[3]===null||b[2]===null)return a[1];
    const u=(t-a[0])/d,u2=u*u,u3=u2*u;
    return (2*u3-3*u2+1)*a[1]+(u3-2*u2+u)*a[3]*d+(-2*u3+3*u2)*b[1]+(u3-u2)*b[2]*d;
  }
  return keys.at(-1)[1];
}
export function curve(c,t=0,r=.5,fallback=0){
  if(c==null)return fallback;
  if(typeof c==='number')return c;
  switch(c.curveMode){
    case 1:return hermite(c.hi,t)*c.b;
    case 2:return mix(hermite(c.lo,t)*c.b,hermite(c.hi,t)*c.b,r);
    case 3:return mix(c.a,c.b,r);
    default:return fallback;
  }
}
export function stops(keys,t,step=false){
  if(!keys?.length)return null;
  if(t<=keys[0][0])return keys[0].slice(1);
  for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
    const a=keys[i-1],b=keys[i],u=step?0:(t-a[0])/Math.max(1e-9,b[0]-a[0]);
    return a.slice(1).map((v,k)=>mix(v,b[k+1],u));
  }
  return keys.at(-1).slice(1);
}
export function gradient(g,t){return [...(stops(g?.color,t,g?.step)||[1,1,1]),...(stops(g?.alpha,t,g?.step)||[1])];}
export function color(c,t=0,r=.5){
  if(!c)return [1,1,1,1];
  if(c.color)return gradient(c,t);
  switch(c.gradientMode){
    case 0:return c.b.slice();
    case 1:return gradient(c.hi,t);
    case 2:return c.a.map((v,i)=>mix(v,c.b[i],r));
    case 3:{const a=gradient(c.lo,t),b=gradient(c.hi,t);return a.map((v,i)=>mix(v,b[i],r));}
    case 4:return gradient(c.hi,r);
    default:return [1,1,1,1];
  }
}
export function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
