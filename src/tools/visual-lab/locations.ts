import { LocationReview, LOCATIONS, type LocationId } from './LocationReview';
const root = document.querySelector<HTMLElement>('#lab')!;
root.innerHTML = `
  <header class="lab-header"><a class="brand" href="/"><img src="/universe-mark.svg" alt=""/><span>UNIVERSE <b>EXPLORER</b></span></a><span class="review-badge">МЕСТА ДЛЯ ИССЛЕДОВАНИЯ</span><a class="back" href="/">В игру ↗</a></header>
  <section class="review-title"><div><span class="eyebrow">КИНЕМАТОГРАФИЧНЫЙ КОСМОС / 02</span><h1>Примеры будущих окружений</h1></div><p>Ранние пространственные эскизы.<br>Каждую сцену можно облететь.</p></section>
  <nav class="directions" aria-label="Варианты локаций">${LOCATIONS.map((l, i) => `<button data-location="${l.id}" aria-pressed="${i === 0}"><span class="number">0${i + 1}</span><b><span class="full-name">${l.name}</span><span class="compact-name">${l.short}</span></b></button>`).join('')}</nav>
  <section class="stage-shell"><div id="stage"></div><div class="scene-caption"><span class="eyebrow">ПРОСТРАНСТВЕННЫЙ ЭСКИЗ</span><h2 id="scene-name"></h2><span>Игровая локация · условные расстояния</span></div><div class="scene-tools"><button id="flight" aria-label="Остановить пролёт" aria-pressed="true">Ⅱ</button><button id="reset" aria-label="Начать пролёт сначала">↺</button></div><div class="stage-hint">Мышь / палец — осмотреться · два пальца — приблизить</div></section>
  <section class="review-controls"><div class="direction-description"><span class="eyebrow">ЧТО ЗДЕСЬ ИССЛЕДОВАТЬ</span><p id="description"></p></div><div class="direction-description"><span class="eyebrow">ПРЕДЛОЖЕНИЕ</span><p>Это три элемента будущей широкой библиотеки. Цель — индивидуальные поверхности, кольца, объекты, явления и свойства у каждой планеты. Полная система разнообразия ещё разрабатывается.</p></div><label class="quality"><span class="eyebrow">КАЧЕСТВО</span><select id="quality" aria-label="Качество просмотра"><option value="HIGH">Высокое</option><option value="LOW">Лёгкое</option></select></label></section>
  <footer><p>Это эскизы формы, света и пространства, а не финальные игровые локации. Кинематографичный стиль сохранён. Астрономические данные и пропорции основной игры не меняются.</p><details><summary>Диагностика</summary><output id="metrics"></output></details></footer>`;
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
quality.value = matchMedia('(pointer:coarse)').matches || new URLSearchParams(location.search).get('quality') === 'LOW' ? 'LOW' : 'HIGH';
const review = new LocationReview(document.querySelector('#stage')!, quality.value === 'LOW');
const flight = document.querySelector<HTMLButtonElement>('#flight')!;
review.onFlightChange = active => { flight.textContent = active ? 'Ⅱ' : '▷'; flight.setAttribute('aria-pressed', String(active)); flight.setAttribute('aria-label', active ? 'Остановить пролёт' : 'Включить пролёт'); };
function describe(id: LocationId) {
  const item = LOCATIONS.find(item => item.id === id)!;
  document.querySelector('#scene-name')!.textContent = item.name; document.querySelector('#description')!.textContent = item.description;
  document.querySelectorAll<HTMLButtonElement>('[data-location]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.location === id)));
}
describe('ice');
document.querySelectorAll<HTMLButtonElement>('[data-location]').forEach(button => button.onclick = () => { const id = button.dataset.location as LocationId; review.select(id); describe(id); });
flight.onclick = () => review.setFlight(flight.getAttribute('aria-pressed') !== 'true');
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () => { review.reset(); review.setFlight(true); };
quality.onchange = () => review.setQuality(quality.value === 'LOW');
const interval = setInterval(() => { const s = review.snapshot(); document.querySelector('#metrics')!.textContent = `${s.fps} FPS · ${s.calls} draw calls · ${s.geometries} геометрий · ${s.textures} текстур`; }, 1200);
Object.defineProperty(window, '__UNIVERSE_LOCATIONS__', { value: Object.freeze({ snapshot: () => review.snapshot() }), configurable: true });
window.addEventListener('pagehide', event => { if (!event.persisted) { clearInterval(interval); review.dispose(); } });
