import { hudPanels, isTextEntry } from './HudPanels';
import { windowHeader } from './HudArt';

export class ChatUI {
  public readonly chatIconBtn: HTMLButtonElement;
  private readonly chatContainer: HTMLDivElement;
  private readonly messages: HTMLDivElement;
  private readonly input: HTMLInputElement;
  constructor(layer: HTMLElement) {
    this.chatIconBtn = document.createElement('button'); this.chatIconBtn.hidden = true;
    this.chatIconBtn.onclick = () => hudPanels.toggle('comms', document.querySelector<HTMLElement>('[data-hud-command="comms"]') ?? undefined);
    this.chatContainer = document.createElement('div');
    this.chatContainer.id = 'chat-container'; this.chatContainer.className = 'hud-window hud-window--right chat-container';
    this.chatContainer.setAttribute('aria-label', 'Comms');
    this.chatContainer.innerHTML = windowHeader('COMMS', 'comms') + '<div class="comms-channel">GLOBAL CHANNEL</div>';
    this.messages = document.createElement('div'); this.messages.className = 'chat-messages';
    this.messages.setAttribute('role', 'log'); this.messages.setAttribute('aria-live', 'polite');
    const form = document.createElement('form'); form.className = 'chat-compose';
    this.input = document.createElement('input'); this.input.type = 'text'; this.input.maxLength = 1000;
    this.input.placeholder = 'Type a message…'; this.input.setAttribute('aria-label', 'Message');
    const send = document.createElement('button'); send.type = 'submit'; send.textContent = 'SEND';
    form.append(this.input, send); this.chatContainer.append(this.messages, form); layer.append(this.chatContainer);
    hudPanels.register('comms', {
      element: this.chatContainer,
      onOpen: () => { this.input.focus(); document.querySelector('[data-hud-command="comms"]')?.classList.remove('has-unread'); },
      onClose: () => { this.input.blur(); window.dispatchEvent(new CustomEvent('ChatBlur')); },
    });
    this.chatContainer.querySelector('.hud-close')!.addEventListener('click', () => hudPanels.close('comms'));
    this.input.addEventListener('focus', () => window.dispatchEvent(new CustomEvent('ChatFocus')));
    this.input.addEventListener('blur', () => window.dispatchEvent(new CustomEvent('ChatBlur')));
    form.onsubmit = event => {
      event.preventDefault();
      const message = this.input.value.trim(); if (!message) return;
      window.dispatchEvent(new CustomEvent('SendChatMessage', { detail: message }));
      this.input.value = ''; this.input.focus();
    };
    window.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || hudPanels.active || isTextEntry(event.target) || (event.target instanceof HTMLElement && event.target.closest('button,[role="combobox"]')) || layer.style.display === 'none') return;
      event.preventDefault(); this.chatIconBtn.click();
    });
  }
  addChatMessage(username: string, message: string) {
    const row = document.createElement('div'); row.className = 'chat-message';
    const name = document.createElement('strong'); name.textContent = username;
    const body = document.createElement('span'); body.textContent = message;
    row.append(name, body); this.messages.append(row);
    while (this.messages.childElementCount > 200) this.messages.firstElementChild?.remove();
    this.messages.scrollTop = this.messages.scrollHeight;
    if (!hudPanels.isOpen('comms')) document.querySelector('[data-hud-command="comms"]')?.classList.add('has-unread');
  }
}
