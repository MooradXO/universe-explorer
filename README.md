# Universe Explorer

`Universe Explorer` — браузерная 3D space game на `TypeScript`, `Vite` и `Three.js`.

Игрок управляет кораблём в процедурном космосе, сражается с ботами, использует HUD/radar/hangar и входит в атмосферу детерминированно сгенерированных планет. Проект находится в стадии playable prototype: основной игровой цикл работает, сейчас идёт visual/performance polish перед публичной демонстрацией.

## Возможности

- Полёт от третьего лица: acceleration, boost, roll, strafe и смена камеры.
- Лазер, shotgun, missiles, damage, shields, death/respawn и боты нескольких классов.
- Процедурный космос: звёзды, созвездия, туманности, планеты, чёрная дыра, ISS и Voyager.
- Guest mode и GitHub/Supabase auth, realtime events, chat и proximity voice foundation.
- HUD, radar, hangar, bounty board, graphics modes `HIGH`/`LOW` и mobile controls.
- Подлёт к планете с `ENTER ATMOSPHERE` и отдельный атмосферный режим.
- Детерминированные spherical terrain, water/cloud shells, weather profiles, collision и CC0 environmental props.
- Локальный procedural space ambient без внешних сетевых зависимостей.
- Опциональный внешний stream через `VITE_AMBIENT_STREAM_URL`, только если владелец stream разрешил встраивание.

## Быстрый запуск

Требуется Node.js `20.19+` (рекомендуется актуальная LTS-версия).

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
npm run preview
```

Для GitHub login и realtime-функций скопируйте `.env.example` в локальный `.env` и укажите публичные настройки своего Supabase-проекта. Guest mode работает без Supabase. Файлы `.env*` не публикуются.

## Управление

- `W / S` — тяга вперёд/назад.
- `A / D` — strafe и combat roll.
- `Q / E` — roll.
- `Space / Ctrl` — вертикальный strafe.
- `Shift` — boost.
- Мышь — pitch/yaw, `RMB` — free look.
- `LMB` — огонь, `1–3` — оружие, `C` — цвет лазера.
- `V` — камера, `F` — вход в атмосферу рядом с планетой, `T` — voice mute.

## Структура

- `src/main.ts` — bootstrap приложения.
- `src/core/Engine.ts` — renderer, camera, postprocessing и render loop.
- `src/core/ShipController.ts` — input, flight state, boost, weapons, HP/shields.
- `src/world/WorldBuilder.ts` — orchestration мира, игрока, ботов, боя и HUD.
- `src/world/CombatSystem.ts` — projectiles, swept collision, damage и VFX.
- `src/planet/` — manifest/seed, space surface, atmosphere, spherical terrain, sky/weather и collision.
- `src/world/ShipVisualConfig.ts` — модели, ориентация, nozzles и laser muzzle.
- `nozzle-editor.html` — локальный инструмент калибровки VFX корабля.

## Assets и лицензии

Исходный код распространяется по лицензии [MIT](LICENSE). Планетарный набор имеет отдельные CC0 license notes в `public/assets/planet/`. Корабли и станция принадлежат MooradXO, созданы через платный Meshy AI и отдельно распространяются по CC BY 4.0 согласно `public/models/LICENSES.md`.

## Статус качества

- `npm run build` проходит.
- Desktop и mobile-sized guest smoke проходят.
- Desert, oceanic и ice atmosphere получили отдельные lighting/fog/water/cloud profiles.
- Основной production chunk уменьшен примерно с `1.24 MB` до `302 KB`; тяжёлые библиотеки и voice chat вынесены отдельно.
- Канонический репозиторий текущей версии: [MooradXO/universe-explorer](https://github.com/MooradXO/universe-explorer).
- Ближайшие этапы: дальнейший UI/UX polish, profiling слабых устройств и развитие планетарных гонок.

## Автор

[MooradXO](https://github.com/MooradXO)
