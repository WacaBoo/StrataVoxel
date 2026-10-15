import { cameraBasis, projectDirection, cameraHeading } from './camera.js';
const $ = (id) => document.getElementById(id),
  canvas = $('world'),
  status = $('status');
const compass = $('compass'),
  compassContext = compass.getContext('2d');
const gl = canvas.getContext('webgl', {
  alpha: true,
  antialias: false,
  powerPreference: 'high-performance',
});
let worker,
  vertexCount = 0,
  yaw = 0.72,
  pitch = 0.6,
  zoom = 1,
  size = 128,
  autoOrbit = false,
  renderPending = false,
  pointerDrag = null,
  generationId = 0;
let worldData = null,
  cameraMode = 'orbit',
  selectingSurface = false,
  target = [0, 0, 0],
  eye = [0, 20, 0],
  lastFrame = 0,
  animationFrame = 0;
const pressedKeys = new Set();
function showStatus(message) {
  status.textContent = message;
}
function compileShader(type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(s));
  return s;
}
let program, buffer, uniforms;
if (!gl) {
  showStatus('WebGL is unavailable. Enable hardware acceleration or try another browser.');
  $('settings').querySelector('button[type=submit]').disabled = true;
} else
  try {
    program = gl.createProgram();
    gl.attachShader(
      program,
      compileShader(
        gl.VERTEX_SHADER,
        `
          attribute vec3 position;
          attribute vec3 color;

          uniform vec3 right, up, toward, origin;
          uniform vec2 scale;
          uniform float perspective, farPlane;

          varying vec3 tint;
          varying float fog;

          void main() {
            vec3 relativePosition = position - origin;
            float depth = -dot(relativePosition, toward);

            if (perspective > 0.5) {
              float nearPlane = 0.15;
              float projectedDepth =
                ((farPlane + nearPlane) / (farPlane - nearPlane)) * depth
                - (2.0 * nearPlane * farPlane) / (farPlane - nearPlane);

              gl_Position = vec4(
                dot(relativePosition, right) / scale.x,
                dot(relativePosition, up) / scale.y,
                projectedDepth,
                depth
              );
              fog = smoothstep(farPlane * 0.25, farPlane * 0.85, depth);
            } else {
              gl_Position = vec4(
                dot(relativePosition, right) / scale.x,
                dot(relativePosition, up) / scale.y,
                depth / farPlane,
                1.0
              );
              fog = 0.0;
            }

            tint = color;
          }
        `,
      ),
    );
    gl.attachShader(
      program,
      compileShader(
        gl.FRAGMENT_SHADER,
        `
          precision mediump float;

          varying vec3 tint;
          varying float fog;

          void main() {
            vec3 fogColor = vec3(0.125, 0.17, 0.145);
            gl_FragColor = vec4(mix(tint, fogColor, fog), 1.0);
          }
        `,
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const position = gl.getAttribLocation(program, 'position'),
      color = gl.getAttribLocation(program, 'color');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.SHORT, false, 12, 0);
    gl.enableVertexAttribArray(color);
    gl.vertexAttribPointer(color, 3, gl.UNSIGNED_BYTE, true, 12, 6);
    uniforms = Object.fromEntries(
      ['right', 'up', 'toward', 'scale', 'origin', 'perspective', 'farPlane'].map((n) => [
        n,
        gl.getUniformLocation(program, n),
      ]),
    );
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
  } catch (e) {
    showStatus('The renderer could not start: ' + e.message);
  }
function getCameraBasis() {
  return cameraBasis(yaw, pitch);
}
function drawCompass(b) {
  const ctx = compassContext;
  if (!ctx) return;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  if (compass.width !== 112 * ratio) {
    compass.width = 112 * ratio;
    compass.height = 112 * ratio;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, 112, 112);
  ctx.lineWidth = 1;
  const point = (v, r = 30) => {
    const p = projectDirection(v, b);
    return { x: 56 + p.x * r, y: 52 + p.y * r, depth: p.depth };
  };
  ctx.strokeStyle = '#81917788';
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const t = (i * Math.PI) / 16,
      p = point([Math.cos(t), 0, Math.sin(t)]);
    if (!i) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  const axes = [
    ['N', [0, 0, -1]],
    ['E', [1, 0, 0]],
    ['S', [0, 0, 1]],
    ['W', [-1, 0, 0]],
    ['↑', [0, 1, 0]],
  ]
    .map(([label, v]) => ({ label, v, p: point(v) }))
    .sort((a, b) => a.p.depth - b.p.depth);
  ctx.font = '12px Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const a of axes) {
    ctx.strokeStyle = a.label === 'N' ? '#c1e78b' : a.p.depth < 0 ? '#637660' : '#a5b49b';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.setLineDash(a.p.depth < 0 ? [2, 3] : []);
    ctx.beginPath();
    ctx.moveTo(56, 52);
    ctx.lineTo(a.p.x, a.p.y);
    ctx.stroke();
    const label = point(a.v, 43);
    ctx.fillText(
      a.label,
      label.x,
      label.y + (Math.abs(label.y - 52) < 4 ? (a.p.depth > 0 ? 7 : -7) : 0),
    );
  }
  ctx.setLineDash([]);
  ctx.fillStyle = '#c1e78b';
  ctx.fillRect(54, 50, 4, 4);
  const heading = Math.round(cameraHeading(yaw)) % 360;
  ctx.fillStyle = '#b1beaa';
  ctx.fillText(String(heading).padStart(3, '0') + '°', 56, 103);
  compass.setAttribute(
    'aria-label',
    '3D compass. View heading ' + heading + ' degrees. North is negative Z.',
  );
}
function getViewScale() {
  const aspect = canvas.clientWidth / canvas.clientHeight,
    s = (size * 0.93) / zoom;
  return cameraMode === 'surface'
    ? [0.65 * aspect, 0.65]
    : [s * Math.max(1, aspect), s * Math.max(1, 1 / aspect)];
}
function renderWorld() {
  renderPending = false;
  if (!gl || !uniforms || gl.isContextLost()) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.5),
    w = Math.round(canvas.clientWidth * dpr),
    h = Math.round(canvas.clientHeight * dpr);
  if (!w || !h) return;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  const b = getCameraBasis();
  for (const name of ['right', 'up', 'toward']) gl.uniform3fv(uniforms[name], b[name]);
  gl.uniform2fv(uniforms.scale, getViewScale());
  gl.uniform3fv(uniforms.origin, cameraMode === 'surface' ? eye : target);
  gl.uniform1f(uniforms.perspective, cameraMode === 'surface' ? 1 : 0);
  gl.uniform1f(uniforms.farPlane, Math.max(256, size * 2.5));
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
  drawCompass(b);
}
function requestDraw() {
  if (!renderPending) {
    renderPending = true;
    requestAnimationFrame(renderWorld);
  }
}
function settings() {
  return {
    seed: $('seed').value.trim() || 'STRATA',
    preset: $('mixed').checked ? 'mixed' : $('preset').value,
    relief: Number($('relief').value),
    height: Number($('height').value),
    dynamics: Number($('dynamics').value),
    sea: Number($('sea').value),
    size: Number($('detail').value),
    caves: $('caves').checked,
    cutaway: $('cutaway').checked,
  };
}
function generate() {
  if (!uniforms || gl.isContextLost()) return;
  clearTimeout(debounce);
  const p = settings(),
    job = ++generationId;
  worker?.terminate();
  worker = new Worker(new URL('./terrain-worker.js', import.meta.url), { type: 'module' });
  status.textContent = p.size >= 640 ? 'Growing a large world…' : 'Growing your world…';
  $('viewport').setAttribute('aria-busy', 'true');
  $('cancel').hidden = false;
  worker.onmessage = ({ data }) => {
    if (job !== generationId) return;
    if (data.progress) {
      status.textContent = data.progress;
      return;
    }
    $('viewport').setAttribute('aria-busy', 'false');
    $('cancel').hidden = true;
    if (data.error) {
      showStatus('Generation failed: ' + data.error);
      worker.terminate();
      worker = null;
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data.data, gl.STATIC_DRAW);
    vertexCount = data.data.byteLength / 12;
    size = data.size;
    worldData = {
      height: data.height,
      water: data.water,
      surfaceMap: data.surfaceMap,
      limit: data.limit,
      sea: data.sea,
      maxHeight: data.maxHeight,
      baseHeight: data.baseHeight,
    };
    resetView();
    $('time').textContent = data.ms.toLocaleString() + ' ms';
    $('faces').textContent = data.faces.toLocaleString() + ' quads';
    $('voxels').textContent = data.count.toLocaleString() + ' voxels';
    $('specimen').textContent = p.seed;
    $('world-name').textContent =
      p.preset === 'mixed' ? 'A world of biomes' : $('preset').selectedOptions[0].textContent;
    $('mesh').textContent = (data.data.byteLength / 1048576).toFixed(1) + ' MB mesh';
    status.textContent = '';
    requestDraw();
    worker.terminate();
    worker = null;
  };
  worker.onerror = () => {
    $('viewport').setAttribute('aria-busy', 'false');
    $('cancel').hidden = true;
    worker?.terminate();
    worker = null;
    showStatus('Generation could not finish. Try a smaller world size.');
  };
  worker.postMessage(p);
}
function stopOrbit() {
  autoOrbit = false;
  $('rotate').setAttribute('aria-pressed', 'false');
}
function updateView() {
  $('explore').setAttribute('aria-pressed', String(selectingSurface || cameraMode === 'surface'));
  $('explore').textContent =
    cameraMode === 'surface'
      ? 'Back to overview'
      : selectingSurface
        ? 'Cancel selection'
        : 'Explore surface';
  $('view-label').textContent =
    cameraMode === 'surface' ? 'SURFACE / PERSPECTIVE' : zoom.toFixed(1) + '× / ORTHOGRAPHIC';
  $('camera-help').textContent =
    cameraMode === 'surface'
      ? 'WASD MOVE · DRAG LOOK · Q/E HEIGHT · ESC EXIT'
      : selectingSurface
        ? 'CLICK LAND TO STAND THERE · ESC CANCEL'
        : 'DRAG ORBIT · SHIFT-DRAG PAN · SCROLL ZOOM';
  $('surface-move').hidden = cameraMode !== 'surface';
  canvas.style.cursor = selectingSurface ? 'crosshair' : cameraMode === 'surface' ? 'move' : 'grab';
}
function resetView() {
  stopOrbit();
  pressedKeys.clear();
  cameraMode = 'orbit';
  selectingSurface = false;
  yaw = 0.72;
  pitch = 0.6;
  zoom = 1;
  target = [0, worldData ? worldData.sea - 15 : 0, 0];
  updateView();
  requestDraw();
}
function cancelGeneration() {
  clearTimeout(debounce);
  generationId++;
  worker?.terminate();
  worker = null;
  $('cancel').hidden = true;
  $('viewport').setAttribute('aria-busy', 'false');
  status.textContent = worldData
    ? 'Generation cancelled. Previous world retained.'
    : 'Generation cancelled. Choose settings to try again.';
}
function pickSurface(clientX, clientY) {
  if (!worldData) return;
  const rect = canvas.getBoundingClientRect(),
    s = getViewScale(),
    b = getCameraBasis();
  const sx = (((clientX - rect.left) / rect.width) * 2 - 1) * s[0],
    sy = (1 - ((clientY - rect.top) / rect.height) * 2) * s[1];
  const origin = target.map((v, i) => v + b.right[i] * sx + b.up[i] * sy + b.toward[i] * size * 2);
  for (let t = 0; t < size * 4; t += 0.4) {
    const pt = origin.map((v, i) => v - b.toward[i] * t),
      x = Math.floor(pt[0] + size / 2),
      z = Math.floor(pt[2] + size / 2);
    if (x < 0 || x >= worldData.limit || z < 0 || z >= size) continue;
    const h = worldData.height[z * size + x],
      water = worldData.water[z * size + x];
    if (pt[1] > Math.max(h, water) + 1 - 15) continue;
    if (h <= water) {
      status.textContent = 'Choose a land voxel above the water.';
      return;
    }
    eye = [x + 0.5 - size / 2, h + 2.8 - 15, z + 0.5 - size / 2];
    cameraMode = 'surface';
    selectingSurface = false;
    pitch = 0.06;
    stopOrbit();
    status.textContent = '';
    updateView();
    canvas.focus({ preventScroll: true });
    requestDraw();
    return;
  }
  status.textContent = 'No terrain there. Click the top of a land voxel.';
}
function moveSurface(forward, side, vertical, amount) {
  eye[0] += (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * amount;
  eye[2] += (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * amount;
  eye[1] += vertical * amount;
  eye[0] = Math.max(-size / 2 + 0.5, Math.min(worldData.limit - size / 2 - 0.5, eye[0]));
  eye[2] = Math.max(-size / 2 + 0.5, Math.min(size / 2 - 0.5, eye[2]));
  const x = Math.floor(eye[0] + size / 2),
    z = Math.floor(eye[2] + size / 2),
    floor = Math.max(worldData.height[z * size + x], worldData.water[z * size + x]) + 2.8 - 15;
  eye[1] = Math.max(floor, Math.min(worldData.maxHeight + 80, eye[1]));
  requestDraw();
}
function animate(now) {
  animationFrame = 0;
  const dt = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;
  if (!document.hidden) {
    if (autoOrbit && cameraMode === 'orbit') {
      yaw += dt * 0.13;
      requestDraw();
    }
    if (cameraMode === 'surface' && pressedKeys.size)
      moveSurface(
        Number(pressedKeys.has('w')) - Number(pressedKeys.has('s')),
        Number(pressedKeys.has('d')) - Number(pressedKeys.has('a')),
        Number(pressedKeys.has('e')) - Number(pressedKeys.has('q')),
        dt * (pressedKeys.has('shift') ? 36 : 10),
      );
  }
  if (autoOrbit || pressedKeys.size) animationFrame = requestAnimationFrame(animate);
}
function startLoop() {
  if (!animationFrame) {
    lastFrame = performance.now();
    animationFrame = requestAnimationFrame(animate);
  }
}
$('settings').addEventListener('submit', (e) => {
  e.preventDefault();
  clearTimeout(debounce);
  generate();
});
$('random').onclick = () => {
  $('seed').value =
    'STRATA-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase();
  generate();
};
let debounce;
for (const name of ['relief', 'height', 'dynamics', 'sea'])
  $(name).addEventListener('input', () => {
    $(name + '-value').textContent =
      $(name).value + (['relief', 'dynamics'].includes(name) ? '%' : '');
    clearTimeout(debounce);
    debounce = setTimeout(generate, Number($('detail').value) >= 640 ? 450 : 180);
  });
for (const name of ['preset', 'detail', 'caves', 'cutaway'])
  $(name).addEventListener('change', generate);
$('mixed').onchange = () => {
  $('preset').disabled = $('mixed').checked;
  generate();
};
$('cancel').onclick = cancelGeneration;
$('reset').onclick = resetView;
$('explore').onclick = () => {
  if (cameraMode === 'surface') {
    resetView();
    return;
  }
  if (!worldData) return;
  stopOrbit();
  selectingSurface = !selectingSurface;
  status.textContent = '';
  updateView();
  canvas.focus({ preventScroll: true });
};
$('rotate').onclick = () => {
  if (cameraMode === 'surface') return;
  autoOrbit = !autoOrbit;
  $('rotate').setAttribute('aria-pressed', String(autoOrbit));
  if (autoOrbit) startLoop();
};
$('forward').onclick = () => moveSurface(1, 0, 0, 4);
$('backward').onclick = () => moveSurface(-1, 0, 0, 4);
canvas.addEventListener('pointerdown', (e) => {
  pointerDrag = {
    x: e.clientX,
    y: e.clientY,
    startX: e.clientX,
    startY: e.clientY,
    id: e.pointerId,
  };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!pointerDrag || e.pointerId !== pointerDrag.id) return;
  const dx = e.clientX - pointerDrag.x,
    dy = e.clientY - pointerDrag.y;
  if (!selectingSurface) {
    if (e.shiftKey && cameraMode === 'orbit') {
      const b = getCameraBasis(),
        s = getViewScale();
      target = target.map(
        (v, i) =>
          v -
          (b.right[i] * dx * 2 * s[0]) / canvas.clientWidth +
          (b.up[i] * dy * 2 * s[1]) / canvas.clientHeight,
      );
    } else {
      yaw -= dx * 0.006;
      pitch = Math.max(cameraMode === 'surface' ? -1.4 : 0.12, Math.min(1.48, pitch + dy * 0.006));
    }
    requestDraw();
  }
  pointerDrag.x = e.clientX;
  pointerDrag.y = e.clientY;
});
canvas.addEventListener('pointerup', (e) => {
  if (
    pointerDrag &&
    selectingSurface &&
    Math.hypot(e.clientX - pointerDrag.startX, e.clientY - pointerDrag.startY) < 6
  )
    pickSurface(e.clientX, e.clientY);
  pointerDrag = null;
});
for (const event of ['pointercancel', 'lostpointercapture'])
  canvas.addEventListener(event, () => (pointerDrag = null));
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (cameraMode === 'surface') moveSurface(-Math.sign(e.deltaY), 0, 0, 2);
    else {
      zoom = Math.max(0.5, Math.min(128, zoom * Math.exp(-e.deltaY * 0.001)));
      updateView();
      requestDraw();
    }
  },
  { passive: false },
);
canvas.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'escape') {
    resetView();
    status.textContent = '';
    return;
  }
  if (cameraMode === 'surface' && ['w', 'a', 's', 'd', 'q', 'e', 'shift'].includes(k)) {
    e.preventDefault();
    pressedKeys.add(k);
    startLoop();
    return;
  }
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(e.key)) return;
  e.preventDefault();
  if (e.key === 'ArrowLeft') yaw -= 0.1;
  if (e.key === 'ArrowRight') yaw += 0.1;
  if (e.key === 'ArrowUp') pitch = Math.min(1.48, pitch + 0.1);
  if (e.key === 'ArrowDown') pitch = Math.max(cameraMode === 'surface' ? -1.4 : 0.12, pitch - 0.1);
  if (e.key === '+' || e.key === '=') zoom = Math.min(128, zoom * 1.25);
  if (e.key === '-') zoom = Math.max(0.5, zoom / 1.25);
  updateView();
  requestDraw();
});
window.addEventListener('keyup', (e) => pressedKeys.delete(e.key.toLowerCase()));
canvas.addEventListener('blur', () => pressedKeys.clear());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pressedKeys.clear();
});
new ResizeObserver(requestDraw).observe(canvas);
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  worker?.terminate();
  stopOrbit();
  pressedKeys.clear();
  showStatus('Graphics context lost. Reload the page to restart.');
});
if (uniforms) generate();
