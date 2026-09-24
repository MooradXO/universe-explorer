import type { ExplorationSite } from './ExplorationSites';
import type { Triple } from '../space/WorldPosition';
export const SURVEY_KEY='universe:survey-journal:v1';
export interface SurveyRecord { id:string; systemId:string; at:number; }
/** Device-local observations only; never an authority for rewards or economy. */
export class SurveyJournal {
  private records=new Map<string,SurveyRecord>();
  constructor(raw:string|null=null){
    try{if(!raw||raw.length>65536)return;const value=JSON.parse(raw);
      if(value.version!==1||!Array.isArray(value.records)||value.records.length>256)return;
      for(const r of value.records)if(r&&typeof r.id==='string'&&r.id.length<180&&typeof r.systemId==='string'&&r.systemId.length<128&&Number.isSafeInteger(r.at)&&r.at>0)this.records.set(r.id,{id:r.id,systemId:r.systemId,at:r.at});
    }catch{/* Invalid journal never prevents flight. */}
  }
  has(id:string){return this.records.has(id);}
  scan(site:ExplorationSite,systemId:string,position:Triple,at=Date.now()){
    if(!position.every(Number.isFinite)||Math.hypot(...position.map((v,i)=>v-site.approach[i]))>site.scanRadius)return false;
    if(!this.records.has(site.id))this.records.set(site.id,{id:site.id,systemId,at});
    if(this.records.size>256)this.records.delete(this.records.keys().next().value!);return true;
  }
  snapshot(){return [...this.records.values()];}
  serialize(){return JSON.stringify({version:1,records:this.snapshot()});}
}
export function readSurveyJournal(){try{return new SurveyJournal(localStorage.getItem(SURVEY_KEY));}catch{return new SurveyJournal();}}
