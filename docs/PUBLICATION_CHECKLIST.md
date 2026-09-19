# Public repository checklist

## Обновление 19 сентября 2026

- [x] Канонический remote проверен: `MooradXO/universe-explorer`, ветка `main`; перед обновлением GitHub содержал только `99f34cb`.
- [x] Включены текущие исходники, генератор окружений, гостевой вход, HUD Titan & Copper и необходимые игровые ресурсы.
- [x] По новому поручению пользователя удалены 88 изображений созвездий, подписи и весь код их отображения. Старые линии не возвращены.
- [x] Временные сборки, локальные `.env*`, базы каталогов и отменённые материалы созвездий исключены из публикации.
- [x] README обновлён под текущие возможности и границы клиентской сборки/локального API.
- [x] Финальная проверка новой версии: сборка, 68 unit, 6 HUD browser, HIGH/LOW варп и возврат, smoke установленной игры. Результаты: `docs/phases_archive/git-update-2026-09-19/README.md`.

Развёртывание сервера — следующий отдельный этап. Каталог AT-HYG и кеши API не входят в Git; для полной карты/поиска они переносятся и подключаются отдельно.

Target owner: `MooradXO`.

## Ready

- The obsolete Git remote is detached; the old repository must not be reused.
- Supabase configuration is read only from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `.env.example` contains placeholders only; local `.env*` files are ignored.
- Source scan contains no credentials or JWT-like values.
- Temporary build, Vite and TypeScript output files are outside the project tree.
- Root smoke screenshots are ignored; retained evidence lives under `docs/phases_archive/`.
- Production build and browser guest smoke pass.
- Code is split into app, Three.js, Supabase, animation, physics and voice-chat chunks.
- The removed planet surface assets are excluded from production; d3-celestial constellation data retains its BSD-3-Clause notice in source and dist.
- Source code is licensed under MIT with `MooradXO` as the copyright holder.
- Paid-plan Meshy ship/station GLB output is owned by MooradXO and documented separately under CC BY 4.0 with attribution.
- Local procedural ambient is the default; an external stream can be enabled only through `VITE_AMBIENT_STREAM_URL` when embedding permission exists.

## Publication

- Canonical repository: `https://github.com/MooradXO/universe-explorer`.
- Publish the current project as a clean root snapshot without the old `Inaklarnet` repository history.
- Run the final secret scan, production build and dependency audit before the first push.
- After cloning on another computer, create a local `.env` from `.env.example` to enable Supabase multiplayer; guest mode works without it.

## External radio decision

The public-safe build uses local procedural ambient. The stream integration remains a generic opt-in environment setting for explicitly permitted sources. The current build contains no SomaFM URL. Planned Space Radio uses cleared mission clips and original ambience.
