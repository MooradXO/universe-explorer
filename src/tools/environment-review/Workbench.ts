import { GENERATOR_PRESETS, readGeneratorRecipe, type GeneratorRecipe } from '../../world/generation/GeneratorRecipe';
export function workbench(onRecipe:(recipe:GeneratorRecipe|null)=>void,onPin:()=>void,onCompare:(enabled:boolean)=>void){
  const panel=document.createElement('details');panel.className='workbench';panel.open=true;
  panel.innerHTML=`<summary>Generator workbench</summary><div class="workbench-controls">
  <label>Seed<input id="generator-seed" value="universe-01" maxlength="96"></label>
  <label>Preset<select id="generator-preset"></select></label>
  <label>Geography scale<input id="generator-scale" type="number" min="1" max="12" step=".25" value="4"></label>
  <label>Activity<input id="generator-activity" type="number" min="0" max="1" step=".05" value=".6"></label>
  <button id="generator-apply">Create variant</button><button id="generator-reset">Game world</button>
  <button id="generator-pin">Capture A</button><label class="compare-toggle"><input id="generator-compare" type="checkbox">Compare A / B</label>
  </div><p id="generator-notice" role="status">Temporary preview variants. Choose a world above, then set a seed and preset.</p>
  <details><summary>Save or load a recipe</summary><textarea id="generator-json" aria-label="Recipe JSON" spellcheck="false" placeholder="Paste recipe JSON"></textarea><div class="workbench-controls"><button id="generator-export">Export JSON</button><button id="generator-import">Apply JSON</button></div></details>
  <p id="generator-diagnostics"></p></details>`;
  document.querySelector('.toolbar')!.after(panel);
  const get=<T extends HTMLElement>(id:string)=>panel.querySelector<T>(`#generator-${id}`)!;
  const preset=get<HTMLSelectElement>('preset');const labels=["From star and orbit","Rocky","Icy","Oceanic","Mineral","Volcanic","Gas"];
  GENERATOR_PRESETS.forEach((value,i)=>preset.add(new Option(labels[i],value)));
  const read=()=>readGeneratorRecipe(JSON.stringify({version:1,seed:get<HTMLInputElement>('seed').value,preset:preset.value,geography:Number(get<HTMLInputElement>('scale').value),activity:Number(get<HTMLInputElement>('activity').value)}));
  const notice=(message:string)=>get('notice').textContent=message;
  const apply=(r:GeneratorRecipe|null)=>{if(!r){notice("Check the seed, scale (1–12) and activity (0–1).");return;}get<HTMLInputElement>('seed').value=r.seed;preset.value=r.preset;get<HTMLInputElement>('scale').value=String(r.geography);get<HTMLInputElement>('activity').value=String(r.activity);onRecipe(r);notice(`Preview variant: ${r.seed}. Capture it as A, then create B.`);};
  get('apply').onclick=()=>apply(read());get('reset').onclick=()=>{onRecipe(null);notice("Game world profile restored.");};
  get('pin').onclick=()=>{onPin();notice("Variant A captured. Change the parameters and enable comparison.");};
  get<HTMLInputElement>('compare').onchange=e=>onCompare((e.target as HTMLInputElement).checked);
  get('import').onclick=()=>{const r=readGeneratorRecipe(get<HTMLTextAreaElement>('json').value);if(!r){notice("Recipe rejected: unsupported version or invalid parameters.");return;}apply(r);};
  get('export').onclick=()=>{const r=read();if(!r){notice("Enter valid parameters first.");return;}apply(r);const json=JSON.stringify(r,null,2);get<HTMLTextAreaElement>('json').value=json;
    const url=URL.createObjectURL(new Blob([json],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='universe-generator-recipe.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice("Recipe exported as JSON.");};
  return {notice,diagnostics:(text:string)=>get('diagnostics').textContent=text,resetCompare:()=>{get<HTMLInputElement>('compare').checked=false;}};
}
