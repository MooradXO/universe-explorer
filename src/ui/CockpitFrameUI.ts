export class CockpitFrameUI {
  constructor(layer: HTMLElement) {
    const frame = document.createElement('div'); frame.className = 'cockpit-corners'; frame.setAttribute('aria-hidden', 'true');
    for (const corner of ['tl', 'tr', 'bl', 'br']) { const mark = document.createElement('i'); mark.className = corner; frame.append(mark); }
    layer.append(frame);
  }
}
