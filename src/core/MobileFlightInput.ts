/** One thumb supplies forward thrust and a held pitch/yaw command. */
export function mobileFlightInput(x: number, y: number, active: boolean) {
  if (!active || !Number.isFinite(x) || !Number.isFinite(y)) return { thrust: 0, yaw: 0, pitch: 0 };
  const length = Math.hypot(x, y);
  const amount = Math.pow(Math.max(0, (Math.min(1, length) - .12) / .88), 1.4) * .72;
  return { thrust: 1, yaw: amount ? -x / length * amount : 0, pitch: amount ? -y / length * amount : 0 };
}
