function hashSeed(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function createNoise(seed) {
  const hash = (x, z) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (x, z) => {
    const ix = Math.floor(x),
      iz = Math.floor(z);
    let u = x - ix,
      v = z - iz;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    return (
      (hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u) * (1 - v) +
      (hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u) * v
    );
  };
}
export function generateWorld(settings, progress = () => {}) {
  settings = { height: 24, dynamics: 35, ...settings };
  if (
    ![96, 128, 192, 384, 640, 1280].includes(settings.size) ||
    !['islands', 'alpine', 'canyon', 'mixed'].includes(settings.preset) ||
    !Number.isFinite(settings.sea) ||
    settings.sea < 5 ||
    settings.sea > 24 ||
    !Number.isFinite(settings.relief) ||
    settings.relief < 0 ||
    settings.relief > 100 ||
    !Number.isInteger(settings.height) ||
    settings.height < 8 ||
    settings.height > 96 ||
    !Number.isFinite(settings.dynamics) ||
    settings.dynamics < 0 ||
    settings.dynamics > 100 ||
    typeof settings.seed !== 'string'
  )
    throw Error('Invalid world settings');
  const start = performance.now(),
    size = settings.size,
    limit = settings.cutaway ? Math.floor(size * 0.53) : size,
    sea = settings.height + settings.sea,
    seed = hashSeed(settings.seed),
    noise = createNoise(seed),
    dynamic = settings.dynamics / 100;
  const fractalNoise = (x, z) =>
    noise(x, z) * 0.56 +
    noise(x * 2, z * 2) * 0.28 +
    noise(x * 4, z * 4) * 0.12 +
    noise(x * 8, z * 8) * 0.04;
  const smoothstep = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const height = new Uint16Array(size * size),
    water = new Uint16Array(size * size),
    surfaceMap = new Uint8Array(size * size),
    climate = new Uint8Array(size * size),
    trees = [];
  const region = Math.min(size * 0.72, 48 + 360 * (1 - dynamic) ** 2),
    feature = 24 + 100 * (1 - dynamic),
    amplitude = settings.relief / 100;
  progress('Shaping terrain…');
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = z / size,
        wx = x / feature,
        wz = z / feature,
        warp = (noise(x / region + 21, z / region + 37) - 0.5) * 0.75,
        n = fractalNoise(wx + warp, wz - warp);
      const radius = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2),
        fall = smoothstep(0.56, 1.13, radius);
      const wet = smoothstep(0.2, 0.8, noise(x / region + 100, z / region + 100)),
        temp = smoothstep(0.2, 0.8, noise(x / region + 200, z / region + 200));
      climate[z * size + x] =
        Math.min(7, Math.floor(temp * 8)) * 8 + Math.min(7, Math.floor(wet * 8));
      const continent = noise(x / region + 310, z / region + 310),
        mass = smoothstep(0.4, 0.8, noise(x / region + 410, z / region + 410));
      const peak = smoothstep(0.2, 0.85, n),
        rough = (fractalNoise(wx * 3 + 50, wz * 3 + 50) - 0.5) * dynamic * dynamic * 12;
      let uplift = mass * (12 + 38 * peak) + rough;
      if (settings.preset === 'alpine') uplift = (0.3 + 0.7 * mass) * (14 + 42 * peak) + rough;
      if (settings.preset === 'canyon') {
        const terrace = Math.floor(peak * 5) / 5;
        uplift = (0.3 + 0.7 * mass) * (8 + 28 * (peak * (1 - dynamic) + terrace * dynamic));
      }
      let h =
        11 + continent * 10 + (n - 0.5) * (1 + amplitude * 7) + amplitude * uplift - fall * 26;
      if (settings.preset === 'islands') h -= 4;
      height[z * size + x] = settings.height + Math.max(2, Math.floor(h));
      water[z * size + x] = sea;
    }
  progress('Routing streams…');
  const step = 4,
    gridSize = Math.ceil(size / step),
    cellCount = gridSize * gridSize,
    filled = new Float32Array(cellCount),
    parent = new Int32Array(cellCount).fill(-1),
    seen = new Uint8Array(cellCount),
    order = [],
    heap = [];
  const terrainAt = (k) =>
    height[
      Math.min(size - 1, Math.floor(k / gridSize) * step + 2) * size +
        Math.min(size - 1, (k % gridSize) * step + 2)
    ] - settings.height;
  const push = (k) => {
    let i = heap.length;
    heap.push(k);
    while (i) {
      const j = (i - 1) >> 1;
      if (filled[heap[j]] <= filled[k]) break;
      heap[i] = heap[j];
      i = j;
    }
    heap[i] = k;
  };
  const pop = () => {
    const result = heap[0],
      last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let c = i * 2 + 1;
        if (c + 1 < heap.length && filled[heap[c + 1]] < filled[heap[c]]) c++;
        if (filled[last] <= filled[heap[c]]) break;
        heap[i] = heap[c];
        i = c;
      }
      heap[i] = last;
    }
    return result;
  };
  for (let z = 0; z < gridSize; z++)
    for (let x = 0; x < gridSize; x++)
      if (x === 0 || z === 0 || x === gridSize - 1 || z === gridSize - 1) {
        const k = z * gridSize + x;
        seen[k] = 1;
        filled[k] = terrainAt(k);
        push(k);
      }
  while (heap.length) {
    const k = pop();
    order.push(k);
    const x = k % gridSize,
      z = Math.floor(k / gridSize);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx,
          zz = z + dz;
        if (xx < 0 || xx >= gridSize || zz < 0 || zz >= gridSize) continue;
        const q = zz * gridSize + xx;
        if (seen[q]) continue;
        seen[q] = 1;
        parent[q] = k;
        filled[q] = Math.max(terrainAt(q), filled[k] + 0.001);
        push(q);
      }
  }
  const flow = new Uint32Array(cellCount).fill(1);
  for (let i = order.length - 1; i >= 0; i--) {
    const k = order[i];
    if (parent[k] >= 0) flow[parent[k]] += flow[k];
  }
  const threshold = Math.max(38, Math.floor(gridSize * 0.65));
  for (let k = 0; k < cellCount; k++) {
    const to = parent[k];
    if (
      to < 0 ||
      flow[k] < threshold ||
      terrainAt(k) <= settings.sea + 1 ||
      filled[k] > terrainAt(k) + 1.1
    )
      continue;
    const x = (k % gridSize) * step + 2,
      z = Math.floor(k / gridSize) * step + 2,
      tx = (to % gridSize) * step + 2,
      tz = Math.floor(to / gridSize) * step + 2;
    for (let s = 0; s <= step * 2; s++) {
      const t = s / (step * 2),
        cx = x + (tx - x) * t,
        cz = z + (tz - z) * t,
        level =
          settings.height +
          Math.max(settings.sea, Math.floor(filled[k] * (1 - t) + filled[to] * t) - 1),
        width = flow[k] > threshold * 5 ? 2 : 1;
      for (let dz = -width - 2; dz <= width + 2; dz++)
        for (let dx = -width - 2; dx <= width + 2; dx++) {
          const xx = Math.round(cx) + dx,
            zz = Math.round(cz) + dz;
          if (xx < 0 || xx >= size || zz < 0 || zz >= size) continue;
          const q = zz * size + xx,
            d = Math.hypot(dx, dz);
          if (d <= width && height[q] >= level - 2 && height[q] <= level + 3) {
            height[q] = Math.min(height[q], level - 2);
            water[q] = Math.max(water[q], level);
          } else if (d < width + 2)
            height[q] = Math.min(height[q], Math.max(level, Math.floor(level + (d - width) * 2)));
        }
    }
  }
  let maxHeight = sea;
  for (const h of height) maxHeight = Math.max(maxHeight, h);
  const verticalSize = maxHeight + 9,
    blocks = new Uint8Array(limit * size * verticalSize),
    voxelIndex = (x, y, z) => (z * limit + x) * verticalSize + y;
  let count = 0;
  const setVoxel = (x, y, z, t) => {
    if (x < 0 || x >= limit || z < 0 || z >= size || y < 0 || y >= verticalSize) return;
    const i = voxelIndex(x, y, z);
    if (!blocks[i]) count++;
    blocks[i] = t;
  };
  progress('Building strata…');
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const q = z * size + x,
        h = height[q],
        wet = (climate[q] % 8) / 7,
        temp = Math.floor(climate[q] / 8) / 7,
        altitude = h - settings.height - 13;
      let surface = h <= water[q] + 1 ? 3 : wet > 0.5 ? 2 : 1;
      if (temp > 0.8 && wet < 0.4) surface = 3;
      if (settings.preset === 'mixed' && h > water[q] + 1) surface = 10 + climate[q];
      if (settings.preset === 'canyon') surface = 7;
      if (altitude > 22 && h > water[q] + 1) {
        const snow = smoothstep(26 + temp * 18, 36 + temp * 18, altitude);
        surface = 74 + Math.min(15, Math.floor(snow * 16));
      }
      surfaceMap[q] = surface;
      if (x >= limit) continue;
      const dx1 = x - size * (0.25 + 0.5 * noise(z / 110 + 51, seed % 113)),
        dx2 = z - size * (0.25 + 0.5 * noise(x / 130 + 79, seed % 71));
      const r = 2.4 + noise(x / 16, z / 16) * 1.9,
        cy1 = settings.height + 4 + noise(z / 45, 7) * 5,
        cy2 = settings.height + 9 + noise(x / 55, 9) * 5;
      const dy1 = Math.abs(dx1) < r ? Math.sqrt(r * r - dx1 * dx1) : -1,
        dy2 = Math.abs(dx2) < r ? Math.sqrt(r * r - dx2 * dx2) : -1;
      const base = voxelIndex(x, 0, z),
        top = Math.max(h, water[q]);
      for (let y = 0; y <= top; y++) {
        if (
          settings.caves &&
          y > 2 &&
          y < h - 2 &&
          h > water[q] + 3 &&
          ((dy1 >= 0 && Math.abs(y - cy1) < dy1) || (dy2 >= 0 && Math.abs(y - cy2) < dy2))
        )
          continue;
        let t = y > h ? 8 : y === h ? surface : y > h - 3 ? 4 : 5;
        if (settings.preset === 'canyon' && y < h) t = Math.floor(y / 3) % 3 === 0 ? 3 : 7;
        blocks[base + y] = t;
        count++;
      }
      if (
        wet > 0.56 &&
        temp < 0.75 &&
        surface !== 3 &&
        surface !== 7 &&
        surface < 74 &&
        h > water[q] + 2 &&
        altitude < 22 &&
        noise(x * 3.79, z * 3.79) > 0.962 &&
        x > 2 &&
        z > 2 &&
        x < limit - 3 &&
        z < size - 3
      )
        trees.push([x, h, z, 3 + Math.floor(noise(x + 53, z) * 3)]);
    }
  for (const [x, h, z, tall] of trees) {
    for (let y = 1; y <= tall; y++) setVoxel(x, h + y, z, 9);
    for (let dy = 2; dy <= tall + 2; dy++) {
      const r = dy > tall ? 0 : dy === 2 ? 2 : 1;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++)
          if (!blocks[voxelIndex(x + dx, h + dy, z + dz)]) setVoxel(x + dx, h + dy, z + dz, 2);
    }
  }
  const colors = [
    [],
    [0.47, 0.65, 0.3],
    [0.22, 0.4, 0.25],
    [0.8, 0.72, 0.49],
    [0.4, 0.33, 0.23],
    [0.48, 0.53, 0.5],
    [0.87, 0.91, 0.85],
    [0.65, 0.37, 0.22],
    [0.19, 0.48, 0.54],
    [0.34, 0.26, 0.17],
  ];
  for (let t = 0; t < 8; t++)
    for (let w = 0; w < 8; w++) {
      const wet = w / 7,
        dry = smoothstep(0.4, 1, t / 7) * (1 - wet),
        green = [0.52 - 0.3 * wet, 0.65 - 0.24 * wet, 0.32 - 0.08 * wet];
      colors.push(green.map((c, i) => c * (1 - dry) + colors[3][i] * dry));
    }
  for (let i = 0; i < 16; i++)
    colors.push(colors[5].map((v, j) => v * (1 - i / 15) + (colors[6][j] * i) / 15));
  let data = new ArrayBuffer(4 * 1024 * 1024),
    vertexPositions = new Int16Array(data),
    vertexBytes = new Uint8Array(data),
    used = 0,
    faces = 0;
  function emitQuad(d, a, b, origin, width, depth, key) {
    if (used + 72 > data.byteLength) {
      const next = new ArrayBuffer(data.byteLength * 2);
      new Uint8Array(next).set(vertexBytes);
      data = next;
      vertexPositions = new Int16Array(data);
      vertexBytes = new Uint8Array(data);
    }
    const material = Math.abs(key),
      color = colors[material % 1024],
      shade =
        (d === 1
          ? key > 0
            ? 1
            : 0.45
          : d === 0
            ? key > 0
              ? 0.76
              : 0.66
            : key > 0
              ? 0.86
              : 0.6) * (material >= 1024 ? 0.52 : 1);
    for (const corner of [0, 1, 2, 0, 2, 3]) {
      const pos = origin.slice();
      pos[a] += corner === 1 || corner === 2 ? width : 0;
      pos[b] += corner === 2 || corner === 3 ? depth : 0;
      const j = used / 2;
      vertexPositions[j] = pos[0] - size / 2;
      vertexPositions[j + 1] = pos[1] - 15;
      vertexPositions[j + 2] = pos[2] - size / 2;
      vertexBytes[used + 6] = Math.round(color[0] * shade * 255);
      vertexBytes[used + 7] = Math.round(color[1] * shade * 255);
      vertexBytes[used + 8] = Math.round(color[2] * shade * 255);
      used += 12;
    }
    faces++;
  }
  const dims = [limit, verticalSize, size],
    strides = [verticalSize, 1, limit * verticalSize];
  for (let d = 0; d < 3; d++) {
    progress('Merging voxel faces ' + (d + 1) + '/3…');
    const a = (d + 1) % 3,
      b = (d + 2) % 3,
      maskWidth = dims[a],
      maskHeight = dims[b],
      mask = new Int16Array(maskWidth * maskHeight),
      pos = [0, 0, 0];
    for (let slice = -1; slice < dims[d]; slice++) {
      let m = 0;
      pos[d] = slice;
      for (let j = 0; j < maskHeight; j++)
        for (let i = 0; i < maskWidth; i++, m++) {
          const offset = slice * strides[d] + i * strides[a] + j * strides[b],
            v1 = slice < 0 ? 0 : blocks[offset],
            v2 = slice === dims[d] - 1 ? 0 : blocks[offset + strides[d]];
          if (!!v1 === !!v2) {
            mask[m] = 0;
            continue;
          }
          pos[a] = i;
          pos[b] = j;
          const x = pos[0] + (d === 0 && !v1 ? 1 : 0),
            y = pos[1] + (d === 1 && !v1 ? 1 : 0),
            z = pos[2] + (d === 2 && !v1 ? 1 : 0),
            t = v1 || v2;
          const cave =
            t !== 8 && y > 0 && y < height[z * size + x] - 2 && slice >= 0 && slice < dims[d] - 1;
          mask[m] = (v1 ? 1 : -1) * (t + (cave ? 1024 : 0));
        }
      for (let j = 0; j < maskHeight; j++)
        for (let i = 0; i < maskWidth; ) {
          const k = j * maskWidth + i,
            key = mask[k];
          if (!key) {
            i++;
            continue;
          }
          let width = 1,
            depth = 1;
          while (i + width < maskWidth && mask[k + width] === key) width++;
          outer: while (j + depth < maskHeight) {
            for (let q = 0; q < width; q++)
              if (mask[k + depth * maskWidth + q] !== key) break outer;
            depth++;
          }
          pos[d] = slice + 1;
          pos[a] = i;
          pos[b] = j;
          emitQuad(d, a, b, pos, width, depth, key);
          for (let r = 0; r < depth; r++)
            mask.fill(0, k + r * maskWidth, k + r * maskWidth + width);
          i += width;
        }
    }
  }
  return {
    data: data.slice(0, used),
    height,
    water,
    surfaceMap,
    faces,
    count,
    ms: Math.round(performance.now() - start),
    size: size,
    limit,
    sea,
    maxHeight,
    baseHeight: settings.height,
  };
}
