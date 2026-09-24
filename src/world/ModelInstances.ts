import { InstancedMesh, Matrix4, type Mesh, type Object3D } from 'three';

/** Build the single-mesh ship LOD, preserving the GLB's internal node transforms. */
export function createModelInstances(model: Object3D, capacity: number): InstancedMesh | null {
  let source: Mesh | undefined;
  model.traverse(child => { if (!source && (child as Mesh).isMesh) source = child as Mesh; });
  if (!source) return null;
  model.updateWorldMatrix(true, true);
  // Instance matrices already contain the configured ship scale/orientation.
  // Bake only the mesh-to-model transform; never mutate the shared local-ship geometry.
  const relative = new Matrix4().copy(model.matrixWorld).invert().multiply(source.matrixWorld);
  const geometry = source.geometry.clone().applyMatrix4(relative);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const instances = new InstancedMesh(geometry, source.material, capacity);
  instances.count = 0; instances.frustumCulled = false;
  return instances;
}
