type Panel = {
  element: HTMLElement;
  display?: string;
  trigger?: HTMLElement;
  blocking?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
};

/** All flight overlays share one owner, including the lazily loaded native map. */
class HudPanels {
  private panels = new Map<string, Panel>();
  private current: string | null = null;
  private externalClose: (() => void) | null = null;
  private opener: HTMLElement | null = null;

  constructor() {
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.current) {
        event.preventDefault(); event.stopImmediatePropagation(); this.closeAll();
      }
    }, true);
  }
  get active() { return this.current; }
  get blocking() { return !!this.current && this.panels.get(this.current)?.blocking !== false; }
  register(id: string, panel: Panel) {
    this.unregister(id);
    this.panels.set(id, panel);
    panel.element.dataset.hudPanel = id;
    panel.element.hidden = true; panel.element.style.display = 'none';
    if (panel.blocking !== false) {
      panel.element.tabIndex = -1;
      panel.element.setAttribute('role', 'dialog');
    }
    for (const event of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'touchstart', 'touchmove', 'touchend', 'keydown', 'keyup']) {
      panel.element.addEventListener(event, e => e.stopPropagation());
    }
  }
  unregister(id: string) { this.close(id); this.panels.delete(id); }
  isOpen(id: string) { return this.current === id; }
  open(id: string, trigger?: HTMLElement) {
    const panel = this.panels.get(id); if (!panel) return;
    this.closeAll(false);
    this.current = id;
    this.opener = trigger ?? panel.trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    panel.element.hidden = false; panel.element.style.display = panel.display ?? 'flex';
    this.changed(); panel.onOpen?.();
    if (panel.blocking !== false && !panel.element.contains(document.activeElement)) panel.element.focus({ preventScroll: true });
  }
  toggle(id: string, trigger?: HTMLElement) { this.isOpen(id) ? this.closeAll() : this.open(id, trigger); }
  close(id: string) { if (this.isOpen(id)) this.closeAll(); }
  openExternal(id: string, close: () => void, trigger?: HTMLElement) {
    this.closeAll(false); this.current = id; this.externalClose = close;
    this.opener = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.changed();
  }
  releaseExternal(id: string) {
    if (!this.isOpen(id)) return;
    this.current = null; this.externalClose = null; this.changed();
  }
  closeAll(restoreFocus = true) {
    const panel = this.current ? this.panels.get(this.current) : null;
    const external = this.externalClose; const opener = this.opener;
    this.current = null; this.externalClose = null; this.opener = null;
    if (panel) { panel.element.hidden = true; panel.element.style.display = 'none'; panel.onClose?.(); }
    external?.(); this.changed();
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  }
  private changed() {
    document.body.dataset.hudWindow = this.current ?? '';
    document.querySelectorAll<HTMLElement>('[data-hud-command]').forEach(button => {
      const active = button.dataset.hudCommand === this.current || (button.dataset.hudCommand === 'system' && this.current === 'manual');
      button.setAttribute('aria-expanded', String(active)); button.classList.toggle('is-active', active);
    });
    if (this.current) {
      if (document.pointerLockElement) document.exitPointerLock();
      window.dispatchEvent(new CustomEvent('PrimaryFireEnd'));
    }
    window.dispatchEvent(new CustomEvent('HudPanelState', { detail: { id: this.current, blocking: this.blocking } }));
  }
}
export const hudPanels = new HudPanels();
export function isTextEntry(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"]');
}
