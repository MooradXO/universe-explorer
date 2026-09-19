import './style.css';
import { DIRECTIONS, type Quality } from './directions';
import { PreviewScene } from './PreviewScene';
import type { EffectId } from './EffectsPreview';

function startStyleReview() {
const root=document.querySelector<HTMLElement>('#lab')!;
root.innerHTML=`
  <header class="lab-header">
    <a class="brand" href="/" aria-label="В игру Universe Explorer"><img src="/universe-mark.svg" alt=""/><span>UNIVERSE <b>EXPLORER</b></span></a>
    <span class="review-badge"><i></i> ВЫБОР ВИЗУАЛА</span>
    <a class="back" href="/">В игру <span>↗</span></a>
  </header>
  <section class="review-title"><div><span class="eyebrow">ОБЛИК ПОЛЁТНОГО МИРА / 01</span><h1>Как будет выглядеть космос</h1></div>
    <p>Сравни три направления в движении.<br>Переключение здесь — только просмотр.</p></section>
  <nav class="directions" aria-label="Варианты оформления">
    ${DIRECTIONS.map(d=>`<button type="button" data-direction="${d.id}" aria-label="${d.number}. ${d.name}" aria-pressed="${d.id==='cinema'}"><span class="number">${d.number}</span><span><b><span class="full-name">${d.name}</span><span class="compact-name">${d.id==='cinema'?'Кино':d.id==='vivid'?'Яркий':'Сдержанный'}</span></b><small>${d.short}</small></span><span class="choice-indicator">●</span></button>`).join('')}
  </nav>
  <section class="stage-shell" aria-label="Интерактивный просмотр">
    <div id="stage"></div>
    <div class="scene-caption"><span class="eyebrow">ЭСКИЗ ОКРУЖЕНИЯ</span><h2 id="scene-name">Кинематографичный</h2><span>Игровой мир · демонстрационная композиция</span></div>
    <div class="scene-tools"><button id="pause" type="button" aria-pressed="false" aria-label="Пауза анимации">Ⅱ</button><button id="reset" type="button" aria-label="Вернуть исходный ракурс">↺</button></div>
    <div class="stage-hint">Поверни сцену пальцем или мышью · приблизь двумя пальцами</div>
    <div id="loading" role="status">Подготовка сцены…</div>
  </section>
  <section class="review-controls">
    <div class="direction-description"><span class="eyebrow">ЧТО МЕНЯЕТСЯ</span><p id="description"></p></div>
    <div class="effects"><span class="eyebrow">ПОПРОБУЙ ЭФФЕКТЫ</span><div class="effect-buttons" aria-label="Эффекты EpicToonFX">
      <button type="button" data-effect="none" aria-pressed="true">Без эффекта</button><button type="button" data-effect="warp" aria-pressed="false">Варп</button><button type="button" data-effect="scan" aria-pressed="false">Сканирование</button><button type="button" data-effect="anomaly" aria-pressed="false">Аномалия</button>
    </div><span id="effect-status" role="status">Кандидаты из твоей EpicToonFX · звук выключен</span></div>
    <label class="quality"><span class="eyebrow">КАЧЕСТВО</span><select id="quality" aria-label="Качество просмотра"><option value="HIGH">Высокое</option><option value="LOW">Лёгкое</option></select></label>
  </section>
  <footer><p>Это эскиз для согласования стиля. Объекты и расстояния в композиции условные; реальные пропорции игры сохраняются. Выбор напиши в чате.</p>
    <details><summary>Диагностика</summary><output id="metrics"></output></details></footer>
`;
const stage=document.querySelector<HTMLElement>('#stage')!;
const status=document.querySelector<HTMLElement>('#effect-status')!;
const qualitySelect=document.querySelector<HTMLSelectElement>('#quality')!;
const initialQuality:Quality = new URLSearchParams(location.search).get('quality')==='LOW' || matchMedia('(pointer: coarse)').matches?'LOW':'HIGH';
qualitySelect.value=initialQuality;
let preview:PreviewScene | undefined;
let paused=false;
try {
  preview=new PreviewScene(stage,initialQuality,text=>{status.textContent=text;});
  document.querySelector('#loading')!.remove();
} catch(error) {
  document.querySelector('#loading')!.textContent='Не удалось запустить 3D. Попробуй браузер с WebGL или обнови страницу.';
  console.error(error);
}
document.querySelector<HTMLElement>('#description')!.textContent=DIRECTIONS[1].description;
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-direction]')) {
  button.addEventListener('click',()=>{
    const direction=DIRECTIONS.find(d=>d.id===button.dataset.direction)!;
    preview?.setDirection(direction);
    document.querySelector<HTMLElement>('#scene-name')!.textContent=direction.name;
    document.querySelector<HTMLElement>('#description')!.textContent=direction.description;
    for(const sibling of document.querySelectorAll('[data-direction]'))sibling.setAttribute('aria-pressed',String(sibling===button));
  });
}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-effect]')) {
  button.addEventListener('click',()=>{
    void preview?.effects.select(button.dataset.effect as EffectId);
    for(const sibling of document.querySelectorAll('[data-effect]'))sibling.setAttribute('aria-pressed',String(sibling===button));
  });
}
document.querySelector('#pause')!.addEventListener('click',event=>{
  paused=!paused;preview?.setPaused(paused);const button=event.currentTarget as HTMLButtonElement;
  button.setAttribute('aria-pressed',String(paused));button.setAttribute('aria-label',paused?'Продолжить анимацию':'Пауза анимации');button.textContent=paused?'▷':'Ⅱ';
});
document.querySelector('#reset')!.addEventListener('click',()=>preview?.resetCamera());
qualitySelect.addEventListener('change',()=>preview?.setQuality(qualitySelect.value as Quality));
const metrics=window.setInterval(()=>{
  const data=preview?.snapshot();if(!data)return;
  document.querySelector('output')!.textContent=`${data.fps} FPS · ${data.drawCalls} вызовов отрисовки · ${data.effect.particles}/${data.effect.budget} частиц · ${data.geometries} геометрий · ${data.textures} текстур`;
},1500);
// Read-only review diagnostics. No gameplay state or scientific data is accessed.
Object.defineProperty(window,'__UNIVERSE_VISUAL_LAB__',{value:Object.freeze({snapshot:()=>preview?.snapshot()}),configurable:true});
window.addEventListener('pagehide',event=>{if(event.persisted)return;clearInterval(metrics);preview?.dispose();},{once:true});

}
if (new URLSearchParams(location.search).has('locations')) void import('./locations');
else startStyleReview();
