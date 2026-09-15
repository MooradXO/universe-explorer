import * as THREE from 'three';
import { ShipController } from './ShipController';
import { Settings } from './Settings';
import { AdaptiveRenderQuality } from './AdaptiveRenderQuality';
// @ts-ignore
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export class Engine {
  public scene: THREE.Scene;
  public activeScene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public css2dRenderer: CSS2DRenderer;
  public shipController: ShipController;

  private clock: THREE.Clock;
  private loopCallbacks: ((dt: number) => void)[] = [];
  private renderQuality: AdaptiveRenderQuality;
  private isLoopRunning = false;
  private labelRenderAccumulator = 0;


  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);
    this.activeScene = this.scene;
    // NO FOG — it was hiding all distant stars

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 200000);
    this.camera.position.set(0, 0, 300);

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: false,
      powerPreference: 'high-performance',
      precision: isMobile ? 'mediump' : 'highp' // Boost mobile GPU performance
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    // CSS2D Renderer for constellation names
    this.css2dRenderer = new CSS2DRenderer();
    this.css2dRenderer.setSize(window.innerWidth, window.innerHeight);
    this.css2dRenderer.domElement.style.position = 'absolute';
    this.css2dRenderer.domElement.style.top = '0px';
    this.css2dRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.css2dRenderer.domElement);

    // Ship Controller
    this.shipController = new ShipController(this.camera);

    this.renderQuality = new AdaptiveRenderQuality(
      this.renderer,
      null,
      this.css2dRenderer,
      Settings.graphicsMode,
      isMobile,
    );
    this.renderQuality.resize(window.innerWidth, window.innerHeight);

    if (import.meta.env.DEV) {
      (window as any).__universeRenderStats = () => ({
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        points: this.renderer.info.render.points,
        lines: this.renderer.info.render.lines,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        pixelRatio: this.renderer.getPixelRatio(),
      });
    }

    this.clock = new THREE.Clock();

    window.addEventListener('resize', this.onResize.bind(this));

  }

  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderQuality.resize(window.innerWidth, window.innerHeight);
  }

  public startLoop(callback: (dt: number) => void) {
    this.loopCallbacks.push(callback);
    if (this.isLoopRunning) return;
    this.isLoopRunning = true;

    const animate = () => {
      requestAnimationFrame(animate);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.shipController.update(dt);
      this.loopCallbacks.forEach(cb => cb(dt));
      
      this.renderer.render(this.activeScene, this.camera);
      
      this.labelRenderAccumulator += dt;
      if (this.labelRenderAccumulator >= 0.1 && this.css2dRenderer.domElement.style.display !== 'none') {
        this.labelRenderAccumulator %= 0.1;
        this.css2dRenderer.render(this.activeScene, this.camera);
      }

      this.renderQuality.sampleFrame(dt);
    };
    animate();
  }

  public setActiveScene(scene: THREE.Scene) {
    this.activeScene = scene;
    this.css2dRenderer.domElement.style.display = scene === this.scene ? 'block' : 'none';
  }
}
