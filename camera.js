// World axes: east = +X, up = +Y, north = -Z.
export function cameraBasis(yaw, pitch) {
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  return { right: [cy, 0, -sy], up: [-sy * sp, cp, -cy * sp], toward: [sy * cp, sp, cy * cp] };
}
export function projectDirection(direction, basis) {
  const dot = (v) => direction.reduce((sum, n, i) => sum + n * v[i], 0);
  return { x: dot(basis.right), y: -dot(basis.up), depth: dot(basis.toward) };
}
export function cameraHeading(yaw) {
  return ((((-yaw * 180) / Math.PI) % 360) + 360) % 360;
}
