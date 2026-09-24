import { createSurfaceBake, bakeSurfaceRows, type SurfaceRecipe } from './SurfaceBake';
declare const self:{onmessage:((event:MessageEvent)=>void)|null;postMessage(value:unknown,transfer:Transferable[]):void};
let generation=0;
self.onmessage=event=>{
  const {token,recipe,width,cancel}=event.data as {token:number;recipe:SurfaceRecipe;width:number;cancel?:boolean};
  const current=++generation;if(cancel)return;
  const bake=createSurfaceBake(width),started=performance.now();let row=0;
  const step=()=>{
    if(current!==generation)return;
    try{
      bakeSurfaceRows(recipe,bake,row,row+8);row+=8;
      if(row<bake.height)setTimeout(step,0);
      else self.postMessage({token,...bake,ms:performance.now()-started},[bake.pixels.buffer]);
    }catch{self.postMessage({token,error:true},[]);}
  };step();
};
