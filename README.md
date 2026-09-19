# Universe Explorer

`Universe Explorer` — браузерная 3D space game на `TypeScript`, `Vite` и `Three.js`.

Игрок управляет кораблём в космосе, перемещается между звёздными системами, сражается с ботами и использует HUD/radar/hangar. Текущая версия от 19 сентября 2026 года включает генератор окружений и интерфейс Titan & Copper. Изображения созвездий и их отображение удалены по решению пользователя.

## Возможности

- Полёт от третьего лица: acceleration, boost, roll, strafe и смена камеры.
- Лазер, shotgun, missiles, damage, shields, death/respawn и боты нескольких классов.
- Старт у Земли в Солнечной системе, крейсерский полёт между планетами и варп к каталожным звёздам.
- Гостевой вход через ENGAGE; realtime events, chat и proximity voice foundation при настроенном Supabase. GitHub-вход и поиск репозиториев удалены.
- HUD Titan & Copper: верхнее меню, радар, HULL/SHIELD/BOOST, Flight Manual и отдельные окна, открывающиеся по одному. Режимы `HIGH`/`LOW` и сенсорное управление.
- Восемь планет Солнечной системы и игровые процедурные планеты других систем; индивидуальные поверхности, атмосферы, кольца, спутники, сооружения и визуальные явления.
- Потоковая генерация окружений около планет и в пространстве между ними: поля обломков, пыль, газовые облака и редкие объекты.
- Worker generation, ограниченный cache соседних секторов и floating origin для дальних перелётов.
- Read-only debug API, named scenes и автоматические desktop/mobile smoke.
- Локальный procedural space ambient без внешних сетевых зависимостей.
- 3D-карта AT-HYG с поиском; сведения Gaia DR3, SIMBAD и NASA NED по запросу с ограниченным кешем. [Запуск и ограничения каталогов](docs/CATALOG_PIPELINE.md).
- Опциональный внешний stream через `VITE_AMBIENT_STREAM_URL`, только если владелец stream разрешил встраивание.

## Быстрый запуск

Требуется Node.js `24.19+`: локальные сервисы каталогов используют `node:sqlite`, выполнение TypeScript и системные сертификаты.

```powershell
git clone https://github.com/MooradXO/universe-explorer.git
cd universe-explorer
npm ci
npm run dev
```

Открыть адрес, который покажет Vite; по умолчанию это `http://localhost:3000/`.

Production-проверка:

```powershell
npm run build
npm run preview -- --port 3000
```

На текущем Windows-компьютере доступен запуск через `./scripts/run.ps1 dev`, а проверки — через `./scripts/run.ps1 build` и `./scripts/run.ps1 test`. Скрипт использует локальный npm, если он не установлен в PATH.

Для realtime-функций скопируйте `.env.example` в локальный `.env` и укажите публичные настройки своего Supabase-проекта. Гостевой одиночный режим работает без Supabase. Локальные `.env*` не публикуются; в репозитории хранится только пример без ключей.

## Каталог и сервер

В репозитории находятся код игры и её визуальные ресурсы. Полный AT-HYG, подготовленные SQLite-базы и кеши научных API хранятся отдельно и в Git не входят. Без них игра запускается в Солнечной системе, но полный поиск и карта каталога требуют подготовки данных по [инструкции](docs/CATALOG_PIPELINE.md).

`npm run build` создаёт клиентскую сборку. Для полной версии на сервере дополнительно нужны данные каталога и отдельный API: `scripts/server/catalog-server.mjs`. Локальный Vite middleware сохранён для разработки. Одной публикации `dist/` недостаточно для каталожного поиска, карты и запросов Gaia/SIMBAD/NED. [Размещение и откат](docs/DEPLOYMENT.md).

## Управление

- `W / S` — тяга вперёд/назад.
- `A / D` — strafe и combat roll.
- `Q / E` — roll.
- `Space / Ctrl` — вертикальный strafe.
- `Shift` — boost.
- Мышь — pitch/yaw, `RMB` — free look.
- `LMB` — огонь, `1–3` — оружие, `C` — цвет лазера.
- `V` — камера, `T` — voice mute.

## Структура

- `src/main.ts` — bootstrap приложения.
- `src/core/Engine.ts` — renderer, camera, postprocessing и render loop.
- `src/core/ShipController.ts` — input, flight state, boost, weapons, HP/shields.
- `src/world/WorldBuilder.ts` — orchestration мира, игрока, ботов, боя и HUD.
- `src/world/CombatSystem.ts` — projectiles, swept collision, damage и VFX.
- `src/world/space/` — координаты, manifests, worker/cache, фон и batched navigation.
- `src/world/celestial/` — чистый каталог, seed, типы и orbital texture/rim visuals.
- `src/debug/` — снимки состояния и named smoke fixtures.
- `src/network/RealtimeMetrics.ts` — клиентские счётчики событий без payloads.
- `tests/` — Vitest и Playwright; [инструкция debug/smoke](docs/DEBUG_API.md).
- `src/world/ShipVisualConfig.ts` — модели, ориентация, nozzles и laser muzzle.
- `nozzle-editor.html` — локальный инструмент калибровки VFX корабля.

## Assets и лицензии

Исходный код распространяется по лицензии [MIT](LICENSE). Корабли и станция принадлежат MooradXO, созданы через платный Meshy AI и отдельно распространяются по CC BY 4.0 согласно `public/models/LICENSES.md`. Данные созвездий d3-celestial: [BSD-3-Clause notice](THIRD_PARTY_NOTICES.md), который автоматически включается в production build.

Текстуры Solar System Scope, данные каталогов и выбранные эффекты EpicToonFX имеют собственные условия, перечисленные в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); лицензия MIT на них не распространяется. Элементы HUD сгенерированы для проекта; исходники и сведения о происхождении сохранены в `public/assets/` и `docs/art-direction/`.

## Статус качества

- `npm run build` проходит.
- Desktop и mobile-sized guest smoke проходят.
- Unit-тесты проверяют детерминированные каталоги, окружения, перемещения, гостевой вход и сетевые счётчики.
- Browser-тесты проверяют полёт, карту, окна HUD и сенсорное управление.
- Канонический репозиторий текущей версии: [MooradXO/universe-explorer](https://github.com/MooradXO/universe-explorer).
- [Отчёт по HUD](docs/phases_archive/titan-hud-2026-09-18/README.md) и [окружениям](docs/phases_archive/environment-2026-09-17/README.md). Отчёты в `docs/phases_archive/` описывают состояние на дату проверки; созвездия из прежних отчётов впоследствии удалены.
- [Отложенный план расширения окружений](docs/plans/environment-expansion.md).

## Автор

[MooradXO](https://github.com/MooradXO)
