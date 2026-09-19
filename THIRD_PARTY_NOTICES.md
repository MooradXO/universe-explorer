# Third-party notices

## AT-HYG 4.0 — optional local star catalogue

Автор сборника: David Nash / Astronomy Nexus. Источник: https://codeberg.org/astronexus/athyg

Полный каталог и данные карты хранятся отдельно от repository/public/dist, в локальном `project/.catalog-research/athyg-4.0/`. В `src/world/environments/ReviewAnchors.json` включены шесть неизменённых записей из локального AT-HYG для воспроизводимого просмотра игровых окружений: Proxima Centauri, Sirius, Vega, Betelgeuse, Altair, Rigel. Эта выборка сохраняет лицензию данных CC BY-SA 4.0 и атрибуцию David Nash / Astronomy Nexus. Преобразования карты: нормализация полей, индекс поиска, разбиение XYZ по областям, выборки для дальнего обзора и Float32 координаты относительно центра блока. Исходные записи и идентификаторы сохранены отдельно.

Заявленная автором лицензия сборника: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Условия исходных данных Gaia: [CC BY-NC 3.0 IGO / ESA](https://www.cosmos.esa.int/web/gaia-users/license); отдельное разрешение для коммерческого сценария пока не получено. Требования источников не заменяются лицензией кода MIT. Ссылки на первичные каталоги и научные цитирования: [AT-HYG acknowledgments](https://codeberg.org/astronexus/athyg/src/commit/eebe42b3552ae04e67d27ae085a8aad997b42bc0/ACKNOWLEDGMENTS.md).

## Gaia DR3, SIMBAD и NASA/IPAC NED — сведения по запросу

Кеш ответов находится на E вне repository/public/dist. В каждом наблюдении сохранены URL запроса, время снимка, SHA256, единицы и доступные ссылки на публикации; сведения разных источников не сливаются в одну безымянную запись.

- Gaia: ESA / Gaia / DPAC, [Gaia DR3](https://www.cosmos.esa.int/web/gaia/dr3), [условия](https://www.cosmos.esa.int/web/gaia-users/license). Использование API не отменяет условия данных.
- SIMBAD: база CDS, Strasbourg, France; [SIMBAD](https://simbad.cds.unistra.fr/simbad/), [правила CDS и условия конкретных наборов](https://cds.unistra.fr/legals/). Библиографические коды отдельных измерений сохраняются.
- NED: NASA/IPAC Extragalactic Database, финансирование NASA, оператор California Institute of Technology; [About NED](https://ned.ipac.caltech.edu/Documents/Overview). Используются новый API и ссылки на первичные публикации.

Право распространять произвольные снимки этих источников в коммерческой игре этим прототипом не подтверждается. Запрос ESA по поручению пользователя пока не отправлен. Научные данные не входят в лицензию исходного кода MIT.

## Солнечная система и вид из выбранной звезды

Орбитальные параметры восьми планет: [JPL Solar System Dynamics, Approximate Positions — Table 1](https://ssd.jpl.nasa.gov/planets/approx_pos.html). Реализован расчёт фиксированного состояния на J2000.0, без экстраполяции к сегодняшней дате. Строка Земли соответствует приближению барицентра Земля–Луна.

Средние радиусы: [JPL Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html); астрономическая единица: [JPL Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html). Номинальный радиус Солнца 695 700 км: [IAU 2015 Resolution B3](https://www.iau.org/common/Uploaded%20files/IAUGA2015-Resolution-B3-recommended-nominal-conversion.pdf). Это номинальная константа, не измерение изменяющейся поверхности.

Поверхности всех планет иллюстративные. В остальных системах планеты и орбитальные точки исследования генерируются для игры и явно отмечены; они не объявляются подтверждёнными экзопланетами. Радиусы звёзд, кроме номинального солнечного, условные. Направления фоновых звёзд получены из ограниченной выборки AT-HYG относительно выбранной системы; цвет и яркость приблизительные. Политика и атрибуция AT-HYG выше применяются и к этому фону.

## EpicToonFX — локальный визуальный просмотр

Три пресета (SpinPortalBlue, ScanExplosion, Plexus) и семь текстур из приобретённой и адаптированной пользователем библиотеки EpicToonFX-ThreeJS. Original VFX: Archanor VFX. Пользователь разрешил применение подходящих эффектов в игре. Эти материалы не являются MIT/CC0; права на оригинальные эффекты сохраняются. Код адаптации и зависимости подключены в отдельный визуальный прототип. Источники, интеграционная правка и SHA256: `src/vendor/epic-fx/README.md`, `provenance.json`. Включение выбранных ресурсов в игру не предоставляет отдельной лицензии на повторное использование оригинальной библиотеки.

## Генератор окружений — материалы и дополнительные эффекты

Карты Меркурия, атмосферы Венеры, Земли, Марса, Юпитера, Сатурна, Урана, Нептуна и Луны: [Solar System Scope / Textures](https://www.solarsystemscope.com/textures/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Автор: Solar System Scope. Изменения: размеры HIGH/LOW, кодирование WebP, использование с кинематографичным освещением. Это художественные составные карты; отдельные участки исходного набора восстановлены авторами. Точные файлы, ссылки и SHA256: `public/assets/environments/provenance.json`.

Четыре исходных материала (реголит, лёд, минералы, плотность облаков) сгенерированы для Universe Explorer через OpenAI image generation. Это исходники деталей, а крупная география строится отдельно для каждой игровой планеты. Prompts: `docs/research/generated-material-prompts.json`. Сохранены оригинальные PNG, для runtime подготовлены WebP.

Дополнительно выбран компактный набор 66 EpicToonFX-пресетов с 19 общими текстурами: `public/assets/fx-environments/provenance.json`. Original VFX: Archanor VFX; пользователь предоставил купленную адаптированную библиотеку и разрешил использование подходящих эффектов в этой игре. Это пресеты, включая цветовые варианты, а не 66 различных структурных семейств. Оригинальные определения сохранены, звук выключен; адаптер ограничивает количество частиц и масштабирует локальную симуляцию. Исходная библиотека пользователя не изменена.

Положения 11 основных спутников относительно родительских планет: [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), фиксированное J2000.0 TDB, геометрические векторы ICRF, 10 км на игровую единицу. Средние радиусы: [JPL Satellite Physical Parameters](https://ssd.jpl.nasa.gov/sats/phys_par/sep.html). Ответы API сохранены в `docs/research/moon-source/`, преобразование в `scripts/prepare-moon-positions.py`. Абсолютная точность ограничена прежними приближёнными орбитами родительских планет; это не текущая эфемерида. Поверхности спутников, кроме карты Луны, иллюстративные. Кольца, сияния, газовый фон и объекты окружения — художественные.

## d3-celestial — constellation data (BSD-3-Clause)

Автор: Olaf Frohn. Upstream: https://github.com/ofrohn/d3-celestial

Включённые данные, без изменений:

- `src/data/constellations.lines.json` — upstream `data/constellations.lines.json`.
- `src/data/constellations.names.json` — upstream `data/constellations.json` (локально переименован файл).

Источник лицензии: https://github.com/ofrohn/d3-celestial/blob/master/LICENSE
Проверено 2026-09-15. Этот notice включается также в production dist.

```text
Copyright (c) 2015, Olaf Frohn
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
