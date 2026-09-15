import './style.css';
import { Engine } from './core/Engine';
import { WorldBuilder } from './world/WorldBuilder';
import { UIManager } from './ui/UIManager';
import { PhysicsEngine } from './physics/PhysicsEngine';
import { AuthManager } from './auth/AuthManager';
import { AuthUI } from './ui/AuthUI';
import { usesMobileLayout } from './ui/uiPlatform';

interface PlanetSmokeHook {
  enterAtmosphereAt: (index: number) => boolean;
  getManifestSummary: () => {
    planets: { biome: string }[];
  };
}

function startDevPlanetSmoke(auth: AuthManager) {
  if (!import.meta.env.DEV) return;

  const requestedPlanet = new URLSearchParams(window.location.search).get('planetSmoke');
  if (!requestedPlanet) return;

  void auth.signInAsGuest();
  let attempts = 0;
  const tryEnterAtmosphere = () => {
    const smoke = (window as unknown as { __universePlanetSmoke?: PlanetSmokeHook }).__universePlanetSmoke;
    if (smoke) {
      const numericIndex = Number(requestedPlanet);
      const planets = smoke.getManifestSummary().planets;
      const planetIndex = Number.isInteger(numericIndex) && numericIndex >= 0
        ? numericIndex
        : planets.findIndex((planet) => planet.biome === requestedPlanet);
      if (planetIndex >= 0 && smoke.enterAtmosphereAt(planetIndex)) return;
    }

    attempts += 1;
    if (attempts < 80) window.setTimeout(tryEnterAtmosphere, 100);
  };

  window.setTimeout(tryEnterAtmosphere, 250);
}

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
      uiLayer.style.display = 'none';
      ui.setMobileControlsVisible(false);
      world.removeUserShip();
    }
  });
  authUI = new AuthUI(auth);
  startDevPlanetSmoke(auth);

  // Save position every 30 seconds
  setInterval(() => {
    if (auth.isLoggedIn) {
      const pos = engine.camera.position;
      auth.savePosition(pos.x, pos.y, pos.z);
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
  });
}

main().catch(console.error);
