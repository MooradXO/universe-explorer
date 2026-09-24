import { Matrix4, Quaternion, Vector3 } from 'three';

const forward = new Vector3(), right = new Vector3(), up = new Vector3(), backward = new Vector3(), basis = new Matrix4();
const cruiseRotation = new Quaternion();

/** Bounded automatic turns, including departure, obstacle corners and arrival. */
export function steerFlightDirection(rotation: Quaternion, direction: Vector3, dt: number) {
  cruiseRotation.copy(rotation);
  faceFlightDirection(cruiseRotation, direction);
  rotation.rotateTowards(cruiseRotation, Math.max(0, Math.min(.1, dt)) * 1.2);
  return rotation.angleTo(cruiseRotation);
}

/** Automatic travel has a fixed up reference; mapping -Z alone leaves arbitrary roll. */
export function faceFlightDirection(rotation: Quaternion, direction: Vector3) {
  if (direction.lengthSq() < 1e-12) return;
  forward.copy(direction).normalize();
  up.set(0, 1, 0);
  if (Math.abs(forward.y) > .99999) up.set(0, 0, 1);
  right.crossVectors(forward, up).normalize();
  up.crossVectors(right, forward).normalize();
  backward.copy(forward).negate();
  rotation.setFromRotationMatrix(basis.makeBasis(right, up, backward));
}

export function levelFlightDirection(rotation: Quaternion) {
  forward.set(0, 0, -1).applyQuaternion(rotation);
  faceFlightDirection(rotation, forward);
}
