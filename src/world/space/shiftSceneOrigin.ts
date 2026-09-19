import * as THREE from 'three';

/** Scene roots own transforms. World-space instance/particle buffers are rebuilt by their owners. */
export function shiftSceneOrigin(scene: THREE.Scene, camera: THREE.Camera, delta: THREE.Vector3,
  rebuiltRoots: readonly (THREE.Object3D | null)[]): void {
  for (const root of scene.children) {
    if (root instanceof THREE.Light || root === camera || rebuiltRoots.includes(root)) continue;
    root.position.sub(delta);
  }
  camera.position.sub(delta);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
}
