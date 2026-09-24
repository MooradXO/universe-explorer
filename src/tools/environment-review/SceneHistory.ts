import { validateScene,type SceneDocument } from '../../world/generation/SceneDocument';
/** Bounded document history. No scene resources or mutable references are retained. */
export class SceneHistory {
  private past:string[]=[];private future:string[]=[];
  constructor(public current:SceneDocument){}
  commit(next:SceneDocument){const valid=validateScene(next),previous=JSON.stringify(this.current);if(JSON.stringify(valid)===previous)return false;this.past.push(previous);if(this.past.length>40)this.past.shift();this.future=[];this.current=valid;return true;}
  undo(){const prev=this.past.pop();if(!prev)return false;this.future.push(JSON.stringify(this.current));this.current=JSON.parse(prev);return true;}
  redo(){const next=this.future.pop();if(!next)return false;this.past.push(JSON.stringify(this.current));this.current=JSON.parse(next);return true;}
  get canUndo(){return this.past.length>0;}get canRedo(){return this.future.length>0;}
}
