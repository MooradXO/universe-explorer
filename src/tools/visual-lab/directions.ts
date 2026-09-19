export type DirectionId = 'quiet' | 'cinema' | 'vivid';
export type Quality = 'HIGH' | 'LOW';
export interface Direction {
  id: DirectionId; number: string; name: string; short: string; description: string;
  ocean: string; land: string; coast: string; rim: string; dust: string; gas: string;
  nebula: number; glow: number; fill: number; exposure: number;
}
export const DIRECTIONS: readonly Direction[] = [
  { id: 'quiet', number: '01', name: 'Сдержанный', short: 'Глубокая тьма · тонкий свет',
    description: 'Почти чёрный космос, естественные оттенки планет и тонкое свечение. Объекты и силуэты кораблей — главный акцент.',
    ocean: '#103e58', land: '#645d43', coast: '#8d8260', rim: '#6099b7', dust: '#493d40', gas: '#314251',
    nebula: .12, glow: .5, fill: .08, exposure: 1.0 },
  { id: 'cinema', number: '02', name: 'Кинематографичный', short: 'Объём · контраст · цвет',
    description: 'Холодные океаны, тёплый свет звезды и выраженная граница дня и ночи. Локальные облака газа подчёркивают глубину.',
    ocean: '#125274', land: '#77745a', coast: '#c4ad79', rim: '#55bdec', dust: '#ad6256', gas: '#31768c',
    nebula: .58, glow: 1.1, fill: .10, exposure: 1.15 },
  { id: 'vivid', number: '03', name: 'Яркий стилизованный', short: 'Смелая палитра · сильные эффекты',
    description: 'Фиолетовые моря, медные континенты и заметные бирюзовые сияния. Более фантастический облик игровых миров.',
    ocean: '#352459', land: '#9d604f', coast: '#db9e70', rim: '#6feced', dust: '#b5509b', gas: '#288e9c',
    nebula: .9, glow: 1.6, fill: .16, exposure: 1.1 },
];
