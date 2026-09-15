import './styles/chat.css';

export class ChatUI {
  public chatIconBtn!: HTMLButtonElement;
  public chatContainer!: HTMLDivElement;
  private chatMessages!: HTMLDivElement;
  private chatInput!: HTMLInputElement;
  private isMobile: boolean;

  constructor(layer: HTMLElement, closeAllPanelsExcept: (exceptId: string) => void) {
    this.isMobile = navigator.maxTouchPoints > 0;
    this.initChat(layer, closeAllPanelsExcept);
  }

  private getChatBtnHTML(hasNotification = false): string {
    const dot = hasNotification ? `<div style="position:absolute;top:2px;right:2px;width:8px;height:8px;background:#ff3333;box-shadow:0 0 8px #ff3333;border-radius:50%;z-index:10;"></div>` : '';
    const svgIcon = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M12 2a10 10 0 0 1 10 10M12 6a6 6 0 0 1 6 6M12 10a2 2 0 0 1 2 2"></path><circle cx="12" cy="18" r="2"></circle><path d="M12 12v4"></path></svg>`;
    
    return `${svgIcon}${dot}`;
  }

  private initChat(layer: HTMLElement, closeAllPanelsExcept: (exceptId: string) => void) {
    // Chat Icon Button
    this.chatIconBtn = document.createElement('button');
    this.chatIconBtn.className = 'chat-icon-btn';
    this.chatIconBtn.title = "COMMS LINK";
    
    // Style Chat Icon Button
    this.chatIconBtn.style.cssText = `
      position: absolute;
      bottom: ${this.isMobile ? '20px' : '30px'};
      left: ${this.isMobile ? '120px' : '160px'};
      right: auto;
      width: ${this.isMobile ? '38px' : '42px'};
      height: ${this.isMobile ? '38px' : '42px'};
      padding: 0;
      background: rgba(10,20,30,0.75);
      border: 1px solid #00ccff;
      color: #00ccff;
      font-family: 'Orbitron', sans-serif;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 2px;
      box-shadow: 0 0 10px rgba(0,204,255,0.3);
      text-shadow: 0 0 5px #00ccff;
      cursor: pointer;
      pointer-events: auto;
      z-index: 99;
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
      transition: all 0.2s ease;
    `;
    this.chatIconBtn.innerHTML = this.getChatBtnHTML(false);
    layer.appendChild(this.chatIconBtn);

    // Chat Panel
    this.chatContainer = document.createElement('div');
    this.chatContainer.className = 'chat-container';
    this.chatContainer.style.cssText = `
      position: absolute;
      bottom: ${this.isMobile ? '70px' : '90px'};
      left: ${this.isMobile ? '20px' : '160px'};
      right: auto;
      width: ${this.isMobile ? '260px' : '300px'};
      height: ${this.isMobile ? '180px' : '250px'};
      background: rgba(5,10,20,0.85);
      border-top: 1px solid #ff3333;
      border-bottom: 1px solid #ff3333;
      border-left: 1px solid rgba(255,50,50,0.25);
      border-right: 1px solid rgba(255,50,50,0.25);
      padding: 10px;
      backdrop-filter: blur(6px);
      display: none;
      flex-direction: column;
      pointer-events: auto;
      z-index: 100;
      box-shadow: 0 0 15px rgba(255,0,0,0.15);
      clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
    `;

    this.chatMessages = document.createElement('div');
    this.chatMessages.style.cssText = 'flex-grow:1;overflow-y:auto;display:flex;flex-direction:column;gap:5px;font-family:"Share Tech Mono",monospace;font-size:13px;color:#ffcccc;scrollbar-width:thin;scrollbar-color:rgba(255,50,50,0.5) transparent;pointer-events:auto;';
    
    this.chatInput = document.createElement('input');
    this.chatInput.type = 'text';
    this.chatInput.placeholder = 'Secure link initialized...';
    this.chatInput.style.cssText = 'width:calc(100% - 20px);background:rgba(0,0,0,0.8);border:1px solid rgba(255,50,50,0.3);color:#ff5555;padding:10px;font-family:"Share Tech Mono",monospace;font-size:14px;outline:none;margin-top:10px;';

    this.chatContainer.appendChild(this.chatMessages);
    this.chatContainer.appendChild(this.chatInput);
    layer.appendChild(this.chatContainer);

    // Toggle Chat
    this.chatIconBtn.onclick = () => {
      if (this.chatContainer.style.display === 'none') {
        closeAllPanelsExcept('chat-container');
        this.chatContainer.style.display = 'flex';
        this.chatInput.focus();
        this.chatIconBtn.innerHTML = this.getChatBtnHTML(false); // Clear notifications
      } else {
        this.chatContainer.style.display = 'none';
        this.chatInput.blur();
      }
    };

    // Keyboard Logic
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (this.chatContainer.style.display === 'none') {
          if (document.pointerLockElement) document.exitPointerLock();
          closeAllPanelsExcept('chat-container');
          this.chatContainer.style.display = 'flex';
          this.chatInput.focus();
          e.preventDefault();
        } else {
          const val = this.chatInput.value.trim();
          if (val.length > 0) {
            window.dispatchEvent(new CustomEvent('SendChatMessage', { detail: val }));
          }
          this.chatInput.value = '';
          this.chatContainer.style.display = 'none';
          this.chatInput.blur();
        }
      }
    });

    // Notify ShipController
    this.chatInput.addEventListener('focus', () => { window.dispatchEvent(new CustomEvent('ChatFocus')); });
    this.chatInput.addEventListener('blur', () => { window.dispatchEvent(new CustomEvent('ChatBlur')); });
  }

  public addChatMessage(username: string, message: string) {
    const msg = document.createElement('div');
    msg.className = 'chat-message';
    const author = document.createElement('strong');
    author.textContent = `[${username}]`;
    const content = document.createElement('span');
    content.textContent = message;
    msg.append(author, content);
    this.chatMessages.appendChild(msg);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    // Add Notification dot if collapsed
    if (this.chatContainer.style.display === 'none') {
      this.chatIconBtn.innerHTML = this.getChatBtnHTML(true);
    }
  }
}
