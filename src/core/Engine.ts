import * as THREE from 'three';
import { ShipController } from './ShipController';
import { Settings } from './Settings';
import { AdaptiveRenderQuality } from './AdaptiveRenderQuality';
import { FrameMetrics } from '../debug/FrameMetrics';
// @ts-ignore
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export interface EngineOverlayView {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  resize(width: number, height: number): void;
  snapshot(): unknown;
}

export class Engine {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public css2dRenderer: CSS2DRenderer;
  public shipController: ShipController;
  public readonly frameMetrics = new FrameMetrics();

  private clock: THREE.Clock;
  private loopCallbacks: ((dt: number) => void)[] = [];
  private renderQuality: AdaptiveRenderQuality;
  private isLoopRunning = false;
  private labelRenderAccumulator = 0;
  private overlayView: EngineOverlayView | null = null;

  public setOverlayView(view: EngineOverlayView | null) {
    this.overlayView = view;
    this.css2dRenderer.domElement.style.visibility = view ? 'hidden' : '';
    view?.resize(window.innerWidth, window.innerHeight);
  }

  public getOverlaySnapshot() { return this.overlayView?.snapshot() ?? { open: false }; }


  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);
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

    // CSS2D Renderer for world object labels
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

    this.clock = new THREE.Clock();

    window.addEventListener('resize', this.onResize.bind(this));

  }

  private onResize() {
    this.overlayView?.resize(window.innerWidth, window.innerHeight);
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
      const elapsedSeconds = this.clock.getDelta();
      this.frameMetrics.record(elapsedSeconds);
      const dt = Math.min(elapsedSeconds, 0.05);
      this.shipController.update(dt);
      this.loopCallbacks.forEach(cb => cb(dt));
      
      this.overlayView?.update(dt);
      this.renderer.render(this.overlayView?.scene ?? this.scene, this.overlayView?.camera ?? this.camera);
      
      this.labelRenderAccumulator += dt;
      if (!this.overlayView && this.labelRenderAccumulator >= 0.1 && this.css2dRenderer.domElement.style.display !== 'none') {
        this.labelRenderAccumulator %= 0.1;
        this.css2dRenderer.render(this.scene, this.camera);
      }

      this.renderQuality.sampleFrame(dt);
    };
    animate();
  }

}
