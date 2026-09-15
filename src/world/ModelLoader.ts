import * as THREE from 'three';
// @ts-ignore
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<THREE.Group>>();

function polishMaterials(root: THREE.Object3D) {
  root.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.frustumCulled = true;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (mat instanceof THREE.MeshStandardMaterial) {
        mat.roughness = Math.min(mat.roughness ?? 0.65, 0.72);
        mat.metalness = Math.max(mat.metalness ?? 0.1, 0.18);
        mat.envMapIntensity = 0.45;
      }
      mat.needsUpdate = true;
    }
  });
}

function cloneWithSharedMaterials(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
  polishMaterials(clone);
  return clone;
}

export function loadModelClone(path: string): Promise<THREE.Group> {
  if (!modelCache.has(path)) {
    modelCache.set(path, new Promise((resolve, reject) => {
      loader.load(path, (gltf: any) => {
        const root = gltf.scene as THREE.Group;
        polishMaterials(root);
        resolve(root);
      }, undefined, reject);
    }));
  }

  return modelCache.get(path)!.then(cloneWithSharedMaterials);
}
