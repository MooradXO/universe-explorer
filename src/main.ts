import './style.css';
import { Engine } from './core/Engine';
import { WorldBuilder } from './world/WorldBuilder';
import { UIManager } from './ui/UIManager';
import { PhysicsEngine } from './physics/PhysicsEngine';
import { AuthManager } from './auth/AuthManager';
import { AuthUI } from './ui/AuthUI';
import { usesMobileLayout } from './ui/uiPlatform';
import { installUniverseDebug } from './debug/UniverseDebug';
import type { StarMapUI } from './ui/star-map/StarMapUI';
import { hudPanels } from './ui/HudPanels';
import './ui/styles/titan-hud.css';

function startDevUiSmoke(ui: UIManager) {
  if (!import.meta.env.DEV) return;
  if (new URLSearchParams(window.location.search).get('uiSmoke') !== 'death') return;
  window.setTimeout(() => ui.showDeathScreen(5), 350);
}

async function main() {
  if (usesMobileLayout()) {
    document.body.classList.add('is-mobile');
  }

  const container = document.getElementById('app') as HTMLElement;
  const uiLayer = document.getElementById('ui-layer') as HTMLElement;
  
  // Hide UI Layer by default until user is logged in
  uiLayer.style.display = 'none';

  // Initialize UI
  const ui = new UIManager(uiLayer);
  startDevUiSmoke(ui);

  // Initialize Core Engine (Three.js WebGL)
  const engine = new Engine(container);

  // Initialize Physics (Cannon.js)
  const physics = new PhysicsEngine();

  // Initialize World Generation
  const world = new WorldBuilder(engine, ui);
  installUniverseDebug(engine, world);
  let starMap: StarMapUI | null = null;
  let mapLoading = false;
  window.addEventListener('OpenStarMap', async () => {
    if (starMap || mapLoading) { hudPanels.close('star-map'); return; }
    if (uiLayer.style.display === 'none' || engine.shipController.isDead || world.isWarping) return;
    mapLoading = true;
    let cancelled = false;
    hudPanels.openExternal('star-map', () => { cancelled = true; starMap?.close(); },
      document.getElementById('btn-star-map') ?? undefined);
    try {
      const { StarMapUI } = await import('./ui/star-map/StarMapUI');
      if (!cancelled && uiLayer.style.display !== 'none' && !engine.shipController.isDead) {
        starMap = new StarMapUI(engine, uiLayer, () => { starMap = null; hudPanels.releaseExternal('star-map'); }, world.currentSystemId ?
          { currentSystemId: world.currentSystemId, warp: object => world.warpTo(object) } : undefined);
      }
    } finally {
      mapLoading = false;
      if (!starMap) hudPanels.releaseExternal('star-map');
    }
  });

  // Initialize Auth
  let authUI: AuthUI;
  const auth = new AuthManager((loggedIn: boolean) => {
    // Re-render auth UI on state change
    if (authUI) authUI.render();

    if (loggedIn && auth.profile) {
      uiLayer.style.display = 'block';
      ui.setMobileControlsVisible(true);
      // Spawn user ship and fly to saved position
      world.spawnUserShip(auth);
      console.log(`[Auth] Welcome ${auth.profile.username}! Ship size: ${auth.profile.ship_size}`);
    } else {
      hudPanels.closeAll();
      starMap?.close();
      uiLayer.style.display = 'none';
      ui.setMobileControlsVisible(false);
      world.removeUserShip();
    }
  });
  authUI = new AuthUI(auth);

  // Save position every 30 seconds
  setInterval(() => {
    if (auth.isLoggedIn) {
      const pos = world.getPlayerAbsolutePosition();
      if (pos) auth.savePosition(...pos);
    }
  }, 30000);

  // Start Render Loop
  let frames = 0;
  let lastFpsTime = performance.now();

  engine.startLoop((deltaTime: number) => {
    frames++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      ui.updateFPS(frames);
      frames = 0;
      lastFpsTime = now;
    }

    physics.update(deltaTime);
    world.update(deltaTime);
    if (engine.shipController.isDead) starMap?.close();
  });
}

main().catch(console.error);
