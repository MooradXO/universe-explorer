import { usesMobileLayout } from './uiPlatform';
import './styles/radar.css';

export class RadarUI {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private lastUpdate: number = 0;
  private isMobile: boolean;

  constructor(layer: HTMLElement) {
    this.isMobile = usesMobileLayout();
    this.initCanvas(layer);
  }

  private initCanvas(layer: HTMLElement) {
    const shell = document.createElement('section');
    shell.className = 'radar-shell hud-metal-panel';
    shell.setAttribute('aria-label', 'Tactical radar');

    const heading = document.createElement('div');
    heading.className = 'radar-shell__heading';
    heading.innerHTML = '<span>TACTICAL RADAR</span><small>15 KM</small>';
    shell.appendChild(heading);

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'radar-display';
    const mmSize = this.isMobile ? 92 : 178;
    this.canvas.width = mmSize;
    this.canvas.height = mmSize;
    this.ctx = this.canvas.getContext('2d')!;
    shell.appendChild(this.canvas);
    layer.appendChild(shell);
  }

  public getCanvasSize(): number {
    return this.canvas.width;
  }

  public update(playerX: number, playerZ: number, dots: {id: string, x: number, z: number, isBot: boolean}[], isJamming: boolean = false) {
    const now = performance.now();
    if (now - this.lastUpdate < 66) return; // Throttle radar to ~15 FPS to drastically save CPU
    this.lastUpdate = now;

    const ctx = this.ctx;
    const size = this.canvas.width;
    const center = size / 2;
    const drawRadius = isJamming ? 5000 : 15000; // Jamming cuts range in 3
    const radarRadius = center * 0.95;

    // Clear background
    ctx.clearRect(0, 0, size, size);

    // Save context for shadows/glow effects
    ctx.save();

    // Draw concentric radar grids (cyan holograph style)
    ctx.strokeStyle = 'rgba(91, 153, 139, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(center, center, center * 0.33, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(center, center, center * 0.66, 0, Math.PI * 2); ctx.stroke();
    
    // Outer bold ring
    ctx.strokeStyle = 'rgba(157, 126, 76, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(center, center, radarRadius, 0, Math.PI * 2); ctx.stroke();

    // Crosshairs (tactical dashes)
    ctx.strokeStyle = 'rgba(91, 153, 139, 0.17)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(center, center * 0.05); ctx.lineTo(center, center * 1.95); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(center * 0.05, center); ctx.lineTo(center * 1.95, center); ctx.stroke();
    ctx.setLineDash([]); // Reset

    // Draw ticks around the outer rim (every 30 degrees)
    ctx.strokeStyle = 'rgba(174, 137, 77, 0.55)';
    ctx.lineWidth = 1;
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(center + cos * radarRadius, center + sin * radarRadius);
      ctx.lineTo(center + cos * (radarRadius - 5), center + sin * (radarRadius - 5));
      ctx.stroke();
    }

    // Compass headings (N, S, E, W)
    ctx.fillStyle = 'rgba(221, 190, 128, 0.82)';
    ctx.font = '8px "Share Tech Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', center, center - radarRadius + 10);
    ctx.fillText('S', center, center + radarRadius - 10);
    ctx.fillText('E', center + radarRadius - 10, center);
    ctx.fillText('W', center - radarRadius + 10, center);

    // Tactical HUD metrics
    ctx.fillStyle = isJamming ? 'rgba(211, 70, 61, 0.9)' : 'rgba(105, 185, 145, 0.62)';
    ctx.font = '7px "Share Tech Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(isJamming ? 'RNG: 5KM' : 'RNG: 15KM', 8, 12);
    ctx.textAlign = 'right';
    
    if (isJamming) {
      if (Math.floor(now * 0.005) % 2 === 0) {
        ctx.fillText('SYS: JAMM', size - 8, 12);
      } else {
        ctx.fillText('SYS:      ', size - 8, 12);
      }
    } else {
      ctx.fillText('SYS: ACTV', size - 8, 12);
    }

    // Draw horizontal static noise lines if jamming is active
    if (isJamming) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, radarRadius - 2, 0, Math.PI * 2);
      ctx.clip();
      
      ctx.strokeStyle = 'rgba(255, 51, 85, 0.18)';
      ctx.lineWidth = 1;
      const numLines = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < numLines; j++) {
        const y = center - radarRadius + Math.random() * (radarRadius * 2);
        ctx.beginPath();
        ctx.moveTo(center - radarRadius, y);
        ctx.lineTo(center + radarRadius, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw animated sonar sweep with analog fade tail
    const sweepAngle = (now * 0.0018) % (Math.PI * 2);
    ctx.save();
    for (let i = 0; i < 15; i++) {
      const alpha = (1 - i / 15) * 0.18;
      ctx.strokeStyle = isJamming ? `rgba(211, 70, 61, ${alpha})` : `rgba(82, 170, 150, ${alpha})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(center, center);
      const a = sweepAngle - (i * 0.035);
      ctx.lineTo(center + Math.cos(a) * radarRadius, center + Math.sin(a) * radarRadius);
      ctx.stroke();
    }
    ctx.restore();

    // Map function
    const toCanvas = (wx: number, wz: number) => {
      const dx = wx - playerX;
      const dz = wz - playerZ;
      const cx = center + (dx / drawRadius) * radarRadius;
      const cy = center + (dz / drawRadius) * radarRadius;
      return { cx, cy };
    };

    // Draw targets
    for (const dot of dots) {
      if (dot.id === (window as any).localPlayerId) continue;
      
      let { cx, cy } = toCanvas(dot.x, dot.z);
      if (isJamming) {
        cx += (Math.random() - 0.5) * 5.0;
        cy += (Math.random() - 0.5) * 5.0;
      }
      const distFromCenter = Math.hypot(cx - center, cy - center);

      const isWormhole = (dot as any).isWormhole;
      const isReturnGate = (dot as any).isReturnGate;

      if (distFromCenter > radarRadius) {
        // Smart out-of-range tracking pointer!
        const angle = Math.atan2(cy - center, cx - center);
        const borderX = center + Math.cos(angle) * (radarRadius - 5);
        const borderY = center + Math.sin(angle) * (radarRadius - 5);
        
        ctx.save();
        ctx.translate(borderX, borderY);
        ctx.rotate(angle);
        
        // Pulsate the out-of-range arrow using sine wave
        const pulsate = Math.sin(now * 0.015) * 0.35 + 0.65;
        if (isWormhole) {
          ctx.fillStyle = `rgba(204, 0, 255, ${pulsate})`;
        } else if (isReturnGate) {
          ctx.fillStyle = `rgba(0, 255, 136, ${pulsate})`;
        } else {
          ctx.fillStyle = dot.isBot ? `rgba(255, 51, 85, ${pulsate})` : `rgba(255, 170, 0, ${pulsate})`;
        }
        
        ctx.beginPath();
        ctx.moveTo(4, 0); // Pointer tip
        ctx.lineTo(-4, -3);
        ctx.lineTo(-2, 0);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        // In-radar target
        if (isWormhole) {
          ctx.strokeStyle = isJamming ? 'rgba(204, 0, 255, 0.45)' : 'rgba(204, 0, 255, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 6);
          ctx.lineTo(cx + 6, cy);
          ctx.lineTo(cx, cy + 6);
          ctx.lineTo(cx - 6, cy);
          ctx.closePath();
          ctx.stroke();

          ctx.fillStyle = isJamming ? 'rgba(204, 0, 255, 0.5)' : '#cc00ff';
          ctx.beginPath();
          ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (isReturnGate) {
          ctx.strokeStyle = isJamming ? 'rgba(0, 255, 136, 0.45)' : 'rgba(0, 255, 136, 0.9)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = isJamming ? 'rgba(0, 255, 136, 0.5)' : '#00ff88';
          ctx.beginPath();
          ctx.arc(cx, cy, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (dot.isBot) {
          ctx.strokeStyle = isJamming ? 'rgba(255, 51, 85, 0.45)' : 'rgba(255, 51, 85, 0.85)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 4.5);
          ctx.lineTo(cx + 4.5, cy);
          ctx.lineTo(cx, cy + 4.5);
          ctx.lineTo(cx - 4.5, cy);
          ctx.closePath();
          ctx.stroke();

          ctx.fillStyle = isJamming ? 'rgba(255, 68, 102, 0.5)' : '#ff4466';
          ctx.fillRect(cx - 1, cy - 1, 2, 2);
        } else {
          ctx.strokeStyle = isJamming ? 'rgba(255, 170, 0, 0.45)' : 'rgba(255, 170, 0, 0.85)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(cx, cy, 4, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = isJamming ? 'rgba(255, 215, 0, 0.5)' : '#ffd700';
          ctx.beginPath();
          ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Draw Local Player as a sleek vector Starfighter
    ctx.strokeStyle = isJamming ? '#e34b40' : '#69c0aa';
    ctx.fillStyle = isJamming ? 'rgba(227, 75, 64, 0.25)' : 'rgba(105, 192, 170, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center, center - 6.5);         // Nose tip
    ctx.lineTo(center + 5.5, center + 4.5);    // Right wing
    ctx.lineTo(center + 2, center + 2);        // Right body indent
    ctx.lineTo(center - 2, center + 2);        // Left body indent
    ctx.lineTo(center - 5.5, center + 4.5);    // Left wing
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
}
