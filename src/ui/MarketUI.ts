export class MarketUI {
  private container: HTMLDivElement;
  private searchInput: HTMLInputElement;
  private resultsContainer: HTMLDivElement;

  constructor(layer: HTMLElement) {
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      max-width: 90%;
      height: 500px;
      background: rgba(10, 0, 0, 0.95);
      border: 2px solid #ff3333;
      box-shadow: 0 0 30px rgba(255, 50, 50, 0.2);
      border-radius: 0px;
      backdrop-filter: blur(10px);
      display: none;
      flex-direction: column;
      z-index: 20000;
      padding: 20px;
      pointer-events: auto;
      clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;';
    
    const title = document.createElement('h2');
    title.textContent = 'SPACE MERCHANT TERMINAL';
    title.style.cssText = 'color: #ffaa00; font-family: "Rajdhani", sans-serif; margin: 0; font-size: 1.4rem; text-shadow: 0 0 10px rgba(255,170,0,0.5); letter-spacing: 3px;';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✖';
    closeBtn.style.cssText = 'background:none; border:none; color:#ff3366; font-size:24px; cursor:pointer;';
    closeBtn.onclick = () => this.hide();

    header.appendChild(title);
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // Search bar
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Search open source modules (e.g. react, threejs)...';
    this.searchInput.style.cssText = `
      width: 100%;
      padding: 12px;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 50, 50, 0.5);
      color: #ffcccc;
      font-family: "Share Tech Mono", monospace;
      font-size: 14px;
      outline: none;
      margin-bottom: 20px;
    `;
    this.searchInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        this.search(this.searchInput.value);
      }
    };
    this.container.appendChild(this.searchInput);

    this.resultsContainer = document.createElement('div');
    this.resultsContainer.style.cssText = 'flex-grow:1; overflow-y:auto; display:flex; flex-direction:column; gap:10px; scrollbar-width:thin; scrollbar-color:#ff3333 transparent;';
    this.container.appendChild(this.resultsContainer);

    layer.appendChild(this.container);

    // Initial state event listeners (Lock cursor mechanism integration)
    this.container.addEventListener('mousedown', (e) => e.stopPropagation());
    this.container.addEventListener('wheel', (e) => e.stopPropagation());
  }

  public show() {
    this.container.style.display = 'flex';
    if (document.pointerLockElement) {
       document.exitPointerLock();
    }
    this.searchInput.focus();
  }

  public hide() {
    this.container.style.display = 'none';
  }

  private async search(query: string) {
    if (!query.trim()) return;
    this.resultsContainer.innerHTML = '<div style="color:#aaa; text-align:center; margin-top:20px;">Scanning galaxy for repositories...</div>';
    
    try {
      const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=15`);
      const data = await res.json();

      this.resultsContainer.innerHTML = '';
      if (!data.items || data.items.length === 0) {
        this.resultsContainer.innerHTML = '<div style="color:#ff3366; text-align:center; margin-top:20px;">No signal found.</div>';
        return;
      }

      for (const repo of data.items) {
        const item = document.createElement('div');
        item.style.cssText = 'background:rgba(20,0,0,0.6); border:1px solid rgba(255,50,50,0.3); padding:12px; border-radius:0px; display:flex; justify-content:space-between; align-items:center;';
        
        const info = document.createElement('div');
        info.innerHTML = `
          <div style="color:#ffaa00; font-weight:bold; font-size:16px; margin-bottom:4px; font-family:'Rajdhani',sans-serif; text-transform:uppercase;">${repo.full_name}</div>
          <div style="color:#ffcccc; font-size:12px; margin-bottom:4px; max-width:400px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-family:'Share Tech Mono',monospace;">${repo.description || 'No description'}</div>
          <div style="color:#ff3333; font-size:12px; font-weight:bold; font-family:'Share Tech Mono',monospace;">STAR RATING: ${repo.stargazers_count}</div>
        `;

        const btn = document.createElement('button');
        btn.textContent = '[ EXTRACT ]';
        btn.style.cssText = 'background:rgba(255,50,50,0.2); border:1px solid #ff3333; color:#ffcccc; padding:8px 12px; border-radius:0px; cursor:pointer; font-family:"Rajdhani",sans-serif; font-weight:bold; white-space:nowrap; letter-spacing:1px;';
        btn.onmouseover = () => { btn.style.background = 'rgba(255,50,50,0.4)'; };
        btn.onmouseleave = () => { btn.style.background = 'rgba(255,50,50,0.2)'; };
        btn.onclick = () => {
          // Download directly
          window.open(`${repo.html_url}/archive/HEAD.zip`, '_blank');
        };

        item.appendChild(info);
        item.appendChild(btn);
        this.resultsContainer.appendChild(item);
      }
    } catch (e) {
      this.resultsContainer.innerHTML = '<div style="color:#ff3366; text-align:center; margin-top:20px;">Connection to GitHub Market failed!</div>';
    }
  }
}
