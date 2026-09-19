/** Authored structural recipes. Palette changes never create another family. */
export const ENVIRONMENT_VERSION = 1;
export const SURFACE_GROUPS = [
  ['Кратерные моря','Лучевые кратеры','Цепочки бассейнов','Древний реголит','Каньоны','Столовые плато','Дюнные моря','Складчатые хребты','Трещиноватая кора','Террасные бассейны','Эрозионные русла','Полярные пустыни','Базальтовые равнины','Разлом долины','Слоистые нагорья','Каменные острова'],
  ['Лавовые моря','Кальдеры','Лавовые реки','Сеть огненных разломов','Вулканические щиты','Остывающая корка','Огненный полумесяц','Архипелаг вулканов'],
  ['Ледяные плиты','Полосчатый лёд','Замёрзшие бассейны','Паутина трещин','Полярные покровы','Ледяные гребни','Тёмный ледник','Криовулканические равнины'],
  ['Материки','Архипелаги','Океанические атоллы','Разделённые океаны','Полярные моря','Затопленные долины','Суперконтинент','Мелководные лабиринты'],
  ['Соляные корки','Железистые слои','Стекловидные равнины','Минеральные жилы','Кристаллические бассейны','Обсидиановые гребни','Серные поля','Светлые террасы'],
  ['Широкие газовые полосы','Узкие струйные пояса','Гигантский циклон','Цепь штормов','Полярный вихрь','Облачные волны','Двойной вихрь','Тёмные провалы','Мягкая облачная оболочка','Высотные перья','Турбулентные ленты','Контрастные экваториальные струи','Разорванные полосы','Штормовые узлы','Зональные ступени','Спиральные облака'],
] as const;
export type SurfaceKind = 'rock' | 'lava' | 'ice' | 'ocean' | 'mineral' | 'gas';
const kinds: SurfaceKind[] = ['rock','lava','ice','ocean','mineral','gas'];
const colors = [
  ['#313039','#8e7965','#c1af91','#849eac'], ['#171921','#653c35','#ce8254','#d78160'],
  ['#294b62','#91b7c2','#e2e9dd','#8bcce0'], ['#0d354e','#486954','#bbba83','#83bfe0'],
  ['#26343a','#917c68','#dfc78a','#c5c9a2'], ['#393a55','#9b907e','#d7cbb2','#adc7dc'],
];
export const SURFACES = SURFACE_GROUPS.flatMap((names, group) => names.map((name, shape) => ({
  id: `${kinds[group]}-${shape}`, name, kind: kinds[group], group, shape,
  colors: colors[group], geography: 2.1 + (shape % 4) * 1.7, warp: .12 + (shape % 3) * .23,
  relief: group === 5 ? 0 : .07 + (shape % 5) * .035,
  oceanLevel: group === 3 ? [.49,.39,.34,.54,.47,.57,.62,.46][shape] : 0,
  texture: group === 5 ? 'clouds' : group === 2 ? 'ice' : group === 0 ? 'regolith' : 'mineral',
}))) ;
// Two physically different surface treatments per recipe: exposed and coated.
export const MATERIALS = SURFACES.flatMap((surface, i) => [0,1].map(treatment => ({
  id: `${surface.id}-${treatment ? 'coated' : 'exposed'}`, surface: i, treatment,
  roughness: treatment ? .36 + (i % 5) * .09 : .68 + (i % 4) * .08,
  grain: treatment ? 42 + (i % 7) * 13 : 100 + (i % 9) * 17,
  relief: surface.relief * (treatment ? .55 : 1), coverage: treatment ? .6 : .22,
})));
export const CLOUD_SHAPES = ['Фронты','Циклоны','Перистые нити','Облачные ячейки','Широтные пояса','Полярные шапки','Разорванный покров','Слоистая пелена'] as const;
export const CLOUDS = CLOUD_SHAPES.flatMap((name, shape) => ['Один слой','Два встречных слоя','Высотный сдвиг','Распадающиеся фронты'].map((layer, stack) => ({
  id: `${shape}-${stack}`, name: `${name} · ${layer}`, shape, stack, coverage: .22 + stack * .14,
  scale: 3.4 + shape * .65, speed: .003 + stack * .002, altitude: .006 + stack * .003,
})));
export const ATMOSPHERES = ['Тонкая','Пылевая','Плотная','Ледяная','Высотная','Слоистая'].flatMap((name, type) => [0,1,2,3].map(layer => ({
  id: `${type}-${layer}`, name: `${name} оболочка ${layer + 1}`, type, layer,
  thickness: [.013,.027,.045,.019,.06,.033][type] * (1 + layer * .18),
  density: [.2,.42,.64,.28,.16,.5][type] + layer * .05, falloff: 2.8 + layer * .8,
})));
export const AURORAS = ['Овал','Занавес','Корональные лучи','Разорванные дуги','Двойной пояс','Странствующие пятна','Спираль','Магнитные нити']
  .flatMap((name, shape) => [0,1].map(mode => ({ id: `${shape}-${mode}`, name: `${name} ${mode + 1}`, shape, mode })));
export const RINGS = ['Сплошной пояс','Тонкие нити','Разделённые пояса','Дуги','Пыльный диск','Двойное кольцо','Волны плотности','Фрагменты']
  .flatMap((name, shape) => [0,1,2,3].map(layer => ({ id: `${shape}-${layer}`, name: `${name} ${layer + 1}`, shape, layer,
    inner: 1.25 + layer * .17, outer: 1.7 + layer * .42 + (shape % 3) * .3, bands: 1 + layer * 2 })));
export const OBJECT_SHAPES = ['Глыбы','Ледяные иглы','Плиты','Кристаллы','Металлические фрагменты','Пористые обломки','Слоистые скалы','Двойные тела'] as const;
export const OBJECTS = OBJECT_SHAPES.flatMap((name, shape) => ['Цельные','Расколотые','Выветренные','Сросшиеся'].map((form, erosion) => ({
  id: `${shape}-${erosion}`, name: `${name} · ${form}`, shape, erosion, variants: 6,
  material: [0x72716d,0x87bdc7,0x9b7760,0x9fbcc4,0x728491,0x74695c,0x9a826a,0x606a71][shape],
  roughness: [.95,.25,.86,.18,.42,1,.9,.75][shape], metalness: shape === 4 ? .72 : .04,
})));
export const LAYOUT_SHAPES = ['Дуга','Двойное скопление','Вертикальная стена','Разорванный тор','Спираль','Поток','Сферическая оболочка','Редкие гиганты','Ветви','Воронка','Волновой лист','Цепь островов'] as const;
export const LAYOUTS = LAYOUT_SHAPES.flatMap((name, shape) => ['Открытая','Сегментированная','Многоуровневая','Разветвлённая'].map((form, pattern) => ({
  id: `${shape}-${pattern}`, name: `${name} · ${form}`, shape, pattern,
})));
export const STRUCTURES = ['Орбитальный венец','Верфь','Радиомаяк','Парусная решётка','Хранилище','Связка якорей','Обсерватория','Перерабатывающий узел',
  'Разорванные ворота','Винтовая башня','Тройной док','Разветвлённый коллектор','Кольцевая ферма','Двойной шпиндель','Сеть антенн','Массив зеркал',
  'Капсульный караван','Крестовой ретранслятор','Сотовый комплекс','Разбитый причал','Магнитная катушка','Тросовая станция','Каскад платформ','Арка памяти']
  .map((name, shape) => ({ id: String(shape), name, shape, variants: 8 }));
export const PHENOMENA = ['Резонанс','Плазменная струя','Вихрь частиц','Радиоэхо','Магнитные нити','Пылевая волна','Линза','Криовыброс']
  .flatMap((name, shape) => ['Пульсирующий','Орбитальный','Бегущая волна','Раздвоенный'].map((form, behavior) => ({
    id: `${shape}-${behavior}`, name: `${name} · ${form.toLowerCase()}`, shape, behavior,
    period: 3 + behavior * 1.4 + shape * .21,
  })));
export const MOONS = ['Ударная','Ледяная','Трещиноватая','Вулканическая','Минеральная','Захваченная глыба','Океаническая','Полосчатая']
  .flatMap((name, type) => [0,1,2].map(shape => ({ id: `${type}-${shape}`, name: `${name} луна ${shape + 1}`, type, shape })));
export const MOON_ORBITS = ['Одиночная','Пара','Цепочка','Резонансная','Наклонённая','Полярная','Внутренняя и внешняя','Разреженная','Ретроградная','Веер','Две плоскости','Спутники кольца'];
export const BACKDROP_SHAPES = ['Чистое пространство','Знакомые облачные полосы','Раздельные облака','Тонкие нити','Широкая пылевая полоса','Дуга','Раскол','Волокна','Кольцевая дымка','Рассеянные пятна','Спиральный рукав','Волновой фронт'];
export const LIBRARY_COUNTS = Object.freeze({ surfaces: SURFACES.length, materials: MATERIALS.length, clouds: CLOUDS.length,
  atmospheres: ATMOSPHERES.length, auroras: AURORAS.length, rings: RINGS.length, objects: OBJECTS.length,
  objectForms: OBJECTS.length * 6, layouts: LAYOUTS.length, structures: STRUCTURES.length,
  structureVariants: STRUCTURES.length * 8, phenomena: PHENOMENA.length, moons: MOONS.length, moonOrbits: MOON_ORBITS.length,
  backdrops: BACKDROP_SHAPES.length });
