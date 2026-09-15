import { usesMobileLayout } from './uiPlatform';
import './styles/cockpit-frame.css';

export class CockpitFrameUI {
  constructor(layer: HTMLElement) {
    if (usesMobileLayout()) return;

    const frame = document.createElement('div');
    frame.className = 'cockpit-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.innerHTML = `
      <div class="cockpit-frame__side cockpit-frame__side--left"><i></i><i></i><i></i></div>
      <div class="cockpit-frame__side cockpit-frame__side--right"><i></i><i></i><i></i></div>
      <div class="cockpit-frame__sill cockpit-frame__sill--left"><span></span></div>
      <div class="cockpit-frame__sill cockpit-frame__sill--right"><span></span></div>
      <div class="cockpit-frame__keel"><i></i><i></i><i></i></div>
    `;
    layer.prepend(frame);
  }
}
