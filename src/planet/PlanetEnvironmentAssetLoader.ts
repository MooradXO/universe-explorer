import * as THREE from 'three';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface PlanetInstancedPrototype {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

export class PlanetEnvironmentAssetLoader {
  private readonly loader = new GLTFLoader();
  private readonly prototypeCache = new Map<string, Promise<PlanetInstancedPrototype | null>>();

  public loadPrototype(path: string): Promise<PlanetInstancedPrototype | null> {
    const cached = this.prototypeCache.get(path);
    if (cached) return cached;

    const promise = new Promise<PlanetInstancedPrototype | null>((resolve) => {
      this.loader.load(
        path,
        (gltf: any) => {
          let prototype: PlanetInstancedPrototype | null = null;
          gltf.scene.traverse((child: THREE.Object3D) => {
            const mesh = child as THREE.Mesh;
            if (!prototype && mesh.isMesh && mesh.geometry && mesh.material) {
              prototype = {
                geometry: mesh.geometry as THREE.BufferGeometry,
                material: mesh.material as THREE.Material | THREE.Material[],
              };
            }
          });
          resolve(prototype);
        },
        undefined,
        () => resolve(null),
      );
    });

    this.prototypeCache.set(path, promise);
    return promise;
  }

  public warmup(paths: string[]): Promise<(PlanetInstancedPrototype | null)[]> {
    return Promise.all(paths.map((path) => this.loadPrototype(path)));
  }
}

export const planetEnvironmentAssetLoader = new PlanetEnvironmentAssetLoader();
