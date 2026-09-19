import { hudPanels } from './HudPanels';
/** Persistent in-panel picker: HUD refreshes never mutate an open native popup. */
export class SystemObjectPicker {
  readonly element = document.createElement('div');
  readonly button = document.createElement('button');
  private list = document.createElement('div');
  private options: HTMLButtonElement[] = [];
  private selected = '';
  private active = 0;
  private events = new AbortController();
  private search = '';
  private searchTime = 0;
  constructor(private onSelect: (id: string) => void) {
    this.element.className = 'system-object-picker';
    this.button.type = 'button'; this.button.setAttribute('role', 'combobox');
    this.button.setAttribute('aria-label', 'System destination');
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-controls', 'system-object-options');
    this.button.setAttribute('aria-expanded', 'false');
    this.list.id = 'system-object-options'; this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', 'System destinations'); this.list.hidden = true;
    this.element.append(this.button, this.list);
    hudPanels.register('destination-picker', { element: this.list, display: 'block', blocking: false, onClose: () => {
      this.button.setAttribute('aria-expanded', 'false'); this.button.removeAttribute('aria-activedescendant');
    } });
    this.button.onclick = () => this.setOpen(this.list.hidden);
    this.button.onkeydown = e => this.key(e);
    document.addEventListener('pointerdown', e => {
      if (!this.element.contains(e.target as Node)) this.setOpen(false);
    }, { signal: this.events.signal });
    this.element.addEventListener('focusout', e => {
      if (!this.element.contains(e.relatedTarget as Node)) this.setOpen(false);
    });
  }
  setOptions(items: string[][], selected: string) {
    this.setOpen(false); this.selected = selected;
    this.options = items.map(([id, title], index) => {
      const option = document.createElement('button'); option.type = 'button'; option.tabIndex = -1;
      option.id = `system-object-${index}`; option.dataset.value = id;
      option.setAttribute('role', 'option'); option.textContent = title;
      // Keep keyboard focus on the combobox, including when selecting by touch.
      option.onmousedown = e => e.preventDefault();
      option.onclick = () => this.choose(index);
      return option;
    });
    this.list.replaceChildren(...this.options); this.refresh();
  }
  setDisabled(disabled: boolean) {
    if (this.button.disabled === disabled) return;
    this.button.disabled = disabled; if (disabled) this.setOpen(false);
  }
  private refresh() {
    this.options.forEach(option => option.setAttribute('aria-selected', String(option.dataset.value === this.selected)));
    this.button.textContent = `${this.options.find(option => option.dataset.value === this.selected)?.textContent ?? ''} ▾`;
  }
  private choose(index: number) {
    this.selected = this.options[index].dataset.value!;
    this.refresh(); this.setOpen(false); this.button.focus(); this.onSelect(this.selected);
  }
  private setOpen(open: boolean) {
    if (open && this.button.disabled) return;
    if (open) hudPanels.open('destination-picker', this.button); else hudPanels.close('destination-picker');
    this.list.hidden = !open; this.button.setAttribute('aria-expanded', String(open));
    if (open) {
      this.active = Math.max(0, this.options.findIndex(option => option.dataset.value === this.selected));
      this.highlight();
    } else this.button.removeAttribute('aria-activedescendant');
  }
  private highlight() {
    this.options.forEach((option, index) => option.classList.toggle('is-active', index === this.active));
    const option = this.options[this.active]; if (!option) return;
    this.button.setAttribute('aria-activedescendant', option.id);
    // Scroll only the list, never the page / combobox out of view.
    this.list.scrollTop = Math.max(0, option.offsetTop - this.list.offsetTop - this.list.clientHeight / 2);
  }
  private key(event: KeyboardEvent) {
    if (event.code === 'Tab') { this.setOpen(false); return; }
    if (event.code === 'Escape') { event.preventDefault(); this.setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Space'].includes(event.code)) {
      event.preventDefault();
      if (this.list.hidden) { this.setOpen(true); return; }
      if (event.code === 'Enter' || event.code === 'Space') { this.choose(this.active); return; }
      this.active = event.code === 'Home' ? 0 : event.code === 'End' ? this.options.length - 1 :
        (this.active + (event.code === 'ArrowDown' ? 1 : -1) + this.options.length) % this.options.length;
      this.highlight();
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); if (this.list.hidden) this.setOpen(true);
      this.search = (performance.now() - this.searchTime > 700 ? '' : this.search) + event.key.toLocaleLowerCase();
      this.searchTime = performance.now();
      const index = this.options.findIndex(option => option.textContent!.toLocaleLowerCase().startsWith(this.search));
      if (index >= 0) { this.active = index; this.highlight(); }
    }
  }
  dispose() { hudPanels.unregister('destination-picker'); this.events.abort(); this.element.remove(); }
}
