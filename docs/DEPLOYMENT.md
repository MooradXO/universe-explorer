# Размещение Universe Explorer

Игра: `https://universe.projectai.biz/`. Развёртывание затрагивает только её virtual host и отдельную службу каталога.

Обновление 19.09.2026 установлено и проверено в HIGH/LOW: [отчёт и ограничения](phases_archive/server-deploy-2026-09-19/README.md). Прежний Supabase endpoint сейчас недоступен через DNS; восстановление multiplayer — отдельная задача.

## Состав

- `/var/www/universe-explorer/releases/<release>/public/` — Vite build.
- `/var/www/universe-explorer/releases/<release>/server/` — `scripts/catalog`, `scripts/server`, `src/catalog`, runtime dependency `@xmldom/xmldom` и package metadata.
- `/var/www/universe-explorer/current` — ссылка на активный release.
- `/var/lib/universe-explorer/map-v1/` — `manifest.json`, `search.sqlite`, `tiles/`; данные не входят в Git и доступны службе только для чтения.
- `/var/lib/universe-explorer/online-cache/` — ограниченный кеш Gaia/SIMBAD/NED (32 MiB).
- `/opt/universe-explorer/runtime/node-v24.19.0-linux-x64/` — отдельный Node.js, без замены системного runtime.
- `universe-catalog.service` — непривилегированный пользователь `universe-explorer`, только `127.0.0.1:4312`, память до 512 MiB, CPU до половины одного ядра.

Исходник службы: [`deploy/universe-catalog.service`](../deploy/universe-catalog.service). Служба запускает [`scripts/server/catalog-server.mjs`](../scripts/server/catalog-server.mjs); Vite не требуется на production-сервере. Неподготовленная карта не позволяет службе стартовать.

## Подготовка и замена

1. Проверить Git SHA, TypeScript, unit tests и сборку. Vite-переменные `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` задаются при сборке; сохранять существующий backend игры. Только публичный anon key; service-role credentials клиенту не передаются.
2. Сохранить старую папку сайта и конфигурацию `/etc/nginx/sites-available/universe` в отдельном backup. Снять контрольные суммы остальных virtual hosts и статусы служб.
3. Загрузить отдельный release и каталог; сравнить SHA256 архивов и файлов после распаковки. Разрешения: публичные файлы читаются Nginx, backend и данные — пользователем службы; запись только в её кеш.
4. Запустить только `universe-catalog.service`. Проверить локальные `/healthz`, `/__catalog/manifest`, поиск Proxima, карточку и сжатый блок карты.
5. В конфигурации только игры заменить `root` на `/var/www/universe-explorer/current/public`. Добавить proxy `/__catalog/` на `127.0.0.1:4312`, с upstream `Host` и без входящего `Origin`; исходный middleware сохраняет проверку локального адреса. Закрыть служебные файлы и вернуть 404 для отсутствующих assets. Для `index.html` отключить длительное кеширование.
6. Ограничить обычные запросы каталога и более редкие внешние запросы отдельными Nginx rate-limit zones только этого virtual host. TLS-настройки и redirect сохранить.
7. `nginx -t`, затем graceful reload. Если проверка не проходит, вернуть backup-конфигурацию; остальные sites не редактировать.
8. Проверить HTTPS, нужный entry, HIGH/LOW гостевой полёт, карту, варп и возврат. Проверить остальные virtual hosts и прежние процессы. Пароли, JWT и окружение служб в отчёт не выводить.

## Проверка

```sh
systemctl is-active universe-catalog.service
curl --fail http://127.0.0.1:4312/healthz
curl --fail 'https://universe.projectai.biz/__catalog/search?q=Proxima'
nginx -t
```

## Откат первого обновления 19.09.2026

Старая папка `/var/www/universe_game` сохранена. Backup: `/var/backups/universe-explorer/2026-09-19/`, в нём `previous-game.tar.gz`, `universe.nginx.conf` и исходные SHA конфигураций.

Для отката вернуть только `universe.nginx.conf` в `/etc/nginx/sites-available/universe`, выполнить `nginx -t` и reload. После успешного возврата старого сайта можно остановить только `universe-catalog.service`. Данные и releases автоматически не удалять. Не применять `pm2 restart all`, глобальный restart Docker, обновление системного Node.js или удаление общей `/var/www`.

Условия научных данных и сторонних ресурсов остаются в [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
