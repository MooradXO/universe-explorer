export type HudIcon = 'system' | 'bounties' | 'warp' | 'hangar' | 'comms' | 'map' | 'hull' | 'shield' | 'boost' | 'laser' | 'shotgun' | 'missile' | 'systems' | 'skull';
export function hudIcon(name: HudIcon) {
  return `<img class="hud-icon" src="/assets/ui/titan-v1/icon-${name}.png" alt="" aria-hidden="true" draggable="false">`;
}
export function windowHeader(title: string, icon: HudIcon) {
  return `<header class="hud-window__header">${hudIcon(icon)}<h2>${title}</h2><button type="button" class="hud-close" aria-label="Close ${title.toLowerCase()}">×</button></header>`;
}
