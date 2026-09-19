# Space debug и smoke

`window.__UNIVERSE_DEBUG__` доступен в dev и production. Объект содержит только `version`, `snapshot()` и `planets()`. Возвращаемые значения глубоко заморожены, ссылок на scene, renderer, ship или сетевые payloads нет.

```js
const state = window.__UNIVERSE_DEBUG__.snapshot();
console.table(state.renderer);
console.log(state.fps, state.frameTimeMs, state.p95FrameTimeMs);
console.log(state.world, state.realtime);
const catalog = window.__UNIVERSE_DEBUG__.planets();
```

- FPS, среднее и p95 frame time: последние 180 ненулевых кадров, реальный delta до ограничения simulation step в 50 ms. Это длительность между кадрами, не GPU timer query.
- `renderer`: calls, triangles, points, lines последнего кадра; geometries/textures/programs, размер render buffer и pixel ratio. Счётчик textures отражает объекты, загруженные в WebGL, а не все созданные CanvasTexture.
- `memory`: JS heap, если браузер поддерживает `performance.memory`; иначе `null`. `gpuBytes` всегда `null`: WebGL не даёт надёжного общего счётчика видеопамяти. Heap зависит от GC и не заменяет GPU bytes.
- `starMap`: `open`, выбранный ID, активные/cache/pending blocks, errors, points и бюджеты; камера/центр/масштаб и ключи активных блоков. При закрытой карте только `open: false`. `flightInputBlocked` проверяет отдельный блок ввода корабля. Данные остаются read-only; ссылка на Three scene не выдаётся.
- `world`: seed, число планет текущего сектора, видимость планет обоих LOD, local/remote/bot counts, скорость/камера/HP корабля. `visibleFullPlanets` считает только загруженные полные модели. `planets()` возвращает descriptors текущего сектора: позиции **внутри сектора**, радиусы, seed, тип и palette.
- `world.ship.position`: локальная позиция относительно плавающего центра; `worldPosition`: авторитетные `{sector, offset}`. `cameraOffset` позволяет проверить стабильность chase camera.
- `world.space`: `origin` (координаты центра и число shifts), `stream` (текущий сектор, cache/pending/queued/failed/discarded), `navigation` (batched groups/points), `planets` (active/queued/created/disposed), `jobs` (total/lastMs/maxMs создания визуальных ресурсов на main thread; GPU upload в эту длительность не входит).
- `world.projectiles`: активные снаряды. `world.tour` содержит этап фиксированного smoke-маршрута либо `null`.
- `realtime`: cumulative send attempts и полученные callbacks по типам событий. Исходящие считаются после 10 Hz ограничения, входящие — до distance culling. Это клиентская телеметрия, не delivered acknowledgements и не биллинг Supabase. При offline guest все счётчики равны нулю.

## Named states

`world.flightDust`: измеренные `speed`/`displacement`, локальные sample-координаты частиц, center, opacity, maxOffset, resets и originShifts. Это художественная пыль, не каталог. `world.flightFX`: состояния warp/scan/anomaly, requested/ready/failed, particles, position, simulationUnitsPerFlightUnit и бюджеты. Read-only поля помогают проверять движение, recenter и освобождение эффектов.

Эскизы новых локаций: `/visual-lab.html?locations=1`, read-only `window.__UNIVERSE_LOCATIONS__.snapshot()` (location/quality/flight/camera/resources). В gameplay не импортируются.

Обычный `/` после входа теперь запускает каталожную Солнечную систему. `world.travel` содержит systemId, адрес `{anchor, local}`, текущую цель, warp/cruise/status и посещённые орбитальные точки. `world.space.system` содержит реальные/игровые descriptors, число полных моделей и состояние ограниченного каталожного фона. В этом режиме `planets()` возвращает положения **относительно звезды**, в линейном масштабе 1 unit = 10 км. В старых fixtures ниже сохранены секторные позиции и исходные бюджеты для сравнения регрессий. `realtime.systemId` показывает группу gameplay-пакетов; общий чат не разделяется.

Сохранение новых адресов локальное, в `universe:stellar-flight:v1:<profile|guest>`. Оно не изменяет прежние cloud XYZ. `stellar-flight.spec.ts` проверяет обычный вход, реальный маршрут, неизвестную дистанцию, отказ API, повторные переходы и управление. Текущий preview с каталогами — порт 3001: `$env:UNIVERSE_TEST_PORT='3001'`.

- `/?spaceSmoke=near-base`: гостевой корабль в `[0, 100, 9800]`, база в `[0, 0, 8000]`.
- `/?spaceSmoke=planet-showcase`: гостевой корабль перед первой планетой каталога.

- `/?spaceSmoke=sector-boundary`: гостевой старт в `[0,0,-24950]`; обычный полёт пересекает отрицательную границу сектора.
- `/?spaceSmoke=sector-tour`: фиксированный маршрут из шести перемещений, раз в 4 simulation seconds; включает сектор `[1000000,-1000000,1000000]` и два возвращения домой. Использует тот же relocation path, что ReturnToBase. После маршрута управление остаётся обычным.

Все fixtures требуют обычного `ENGAGE → GUEST SORTIE`, сохраняют штатные flight/combat controls; автоматические перемещения есть только в явно выбранном sector-tour. Неизвестный query игнорируется, GitHub-профиль тестовый spawn не использует. Обычный `/` начинает полёт у солнечной базы или восстанавливает сохранённый системный адрес. Автоматический тест фиксирует только legacy декоративную случайность; каталог планет имеет собственный независимый RNG.

## Проверки

```powershell
npm ci
npm run build
npm test
npx playwright install chromium
npm run test:smoke
```

В Windows с установленным Edge: `$env:PLAYWRIGHT_CHANNEL = 'msedge'` перед smoke. На текущем компьютере `scripts/run.ps1` использует локальный npm из соседней `.tools/`, если npm отсутствует в PATH; `./scripts/run.ps1 test:smoke` выбирает Edge автоматически.

Тестовый runner использует production preview на порту 3000 и один browser worker, чтобы параллельные сцены не искажали замеры. Уже работающий сервер можно переиспользовать только после актуального build. `SMOKE_PHASE` сохраняет совместимость с путём evidence первого спринта; по умолчанию новые named snapshots идут в `docs/phases_archive/sector-streaming-2026-09-15/after/`. Boundary/tour evidence находится рядом в папке sector-streaming. Старые before/after не перезаписываются.

Для новых сравнений задавать `SMOKE_PHASE='../star-map-2026-09-15/flight'` и `SECTOR_EVIDENCE='docs/phases_archive/star-map-2026-09-15/sectors'`. Star-map browser tests требуют подготовленный локальный `map-v1`; UI и ошибки проверяются в production preview на HIGH/LOW. Набор научных данных не входит в repository или browser bundle.

`npm run check:space` также входит в build и предотвращает возврат удалённых runtime-модулей и assets.

## Просмотр с телефона в домашней сети

На 2026-09-15 Wi-Fi адрес компьютера — `192.168.100.182`, ссылка телефона — `http://192.168.100.182:3002/`. Компьютер, preview 3001 и LAN-процесс должны оставаться включёнными. После сборки обновить страницу на телефоне.

Из папки игры, при работающем preview на `127.0.0.1:3001`:

```powershell
node scripts/lan-preview.mjs 192.168.100.182
```

Это отдельный read-only прокси к production preview и каталогу. Он слушает только указанный адрес домашней сети, проверяет Host/Origin и отклоняет POST. Публичный туннель и внешняя публикация не создавались. Правила firewall не менялись: текущий Node.js уже разрешён для активного профиля Windows. Проверены вход, солнечный фон, карта и выбор Проксимы по LAN URL в мобильном браузерном профиле; page errors 0. Проверки адреса/ссылочного перехода: 200; чужого Origin/fetch: 403; POST: 405. Физический телефон проверяет пользователь. Голосовой чат требует защищённого контекста браузера; HTTP LAN-ссылка предназначена прежде всего для просмотра и игрового полёта.
