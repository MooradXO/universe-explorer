import * as THREE from 'three';

interface PostProcessorLike {
  setPixelRatio(value: number): void;
  setSize(width: number, height: number): void;
}

interface LabelRendererLike {
  setSize(width: number, height: number): void;
}

export class AdaptiveRenderQuality {
  private readonly minPixelRatio: number;
  private readonly profileMaxPixelRatio: number;
  private readonly maxRenderPixels: number;
  private readonly adaptive: boolean;
  private pixelRatio = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private sampleSeconds = 0;
  private sampleFrames = 0;
  private cooldownSeconds = 3;
  private healthySamples = 0;
  private initialized = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly composer: PostProcessorLike | null,
    private readonly labels: LabelRendererLike,
    mode: 'HIGH' | 'LOW',
    isMobile: boolean,
  ) {
    this.adaptive = mode === 'HIGH';
    this.minPixelRatio = mode === 'LOW' ? 0.6 : 0.65;
    this.profileMaxPixelRatio = mode === 'LOW' ? 0.75 : (isMobile ? 1 : 1.25);
    this.maxRenderPixels = mode === 'LOW' ? 1_050_000 : 2_100_000;
  }

  public resize(width: number, height: number): void {
    this.viewportWidth = Math.max(1, Math.floor(width));
    this.viewportHeight = Math.max(1, Math.floor(height));

    const pixelBudgetRatio = Math.sqrt(this.maxRenderPixels / (this.viewportWidth * this.viewportHeight));
    const maximum = Math.max(
      this.minPixelRatio,
      Math.min(window.devicePixelRatio || 1, this.profileMaxPixelRatio, pixelBudgetRatio),
    );

    if (!this.initialized) {
      this.pixelRatio = maximum;
      this.initialized = true;
    } else {
      this.pixelRatio = Math.min(this.pixelRatio, maximum);
    }

    this.applySize();
  }

  public sampleFrame(deltaSeconds: number): void {
    if (!this.adaptive || document.hidden) return;

    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 0.1);
    if (this.cooldownSeconds > 0) {
      this.cooldownSeconds -= safeDelta;
      return;
    }

    this.sampleSeconds += safeDelta;
    this.sampleFrames += 1;
    if (this.sampleSeconds < 2) return;

    const fps = this.sampleFrames / this.sampleSeconds;
    this.sampleSeconds = 0;
    this.sampleFrames = 0;

    if (fps < 53 && this.pixelRatio > this.minPixelRatio + 0.01) {
      const step = fps < 40 ? 0.15 : 0.1;
      this.pixelRatio = Math.max(this.minPixelRatio, this.pixelRatio - step);
      this.healthySamples = 0;
      this.cooldownSeconds = 2.5;
      this.applySize();
      return;
    }

    if (fps >= 59) {
      this.healthySamples += 1;
      if (this.healthySamples >= 3) {
        const pixelBudgetRatio = Math.sqrt(this.maxRenderPixels / (this.viewportWidth * this.viewportHeight));
        const maximum = Math.max(
          this.minPixelRatio,
          Math.min(window.devicePixelRatio || 1, this.profileMaxPixelRatio, pixelBudgetRatio),
        );
        const nextRatio = Math.min(maximum, this.pixelRatio + 0.05);
        if (nextRatio > this.pixelRatio + 0.001) {
          this.pixelRatio = nextRatio;
          this.applySize();
        }
        this.healthySamples = 0;
        this.cooldownSeconds = 3;
      }
    } else {
      this.healthySamples = 0;
    }
  }

  private applySize(): void {
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.viewportWidth, this.viewportHeight);
    this.composer?.setPixelRatio(this.pixelRatio);
    this.composer?.setSize(this.viewportWidth, this.viewportHeight);
    this.labels.setSize(this.viewportWidth, this.viewportHeight);
  }
}
