import zlib from "node:zlib";
import type { MeshData } from "../backend.js";

type Vec3 = [number, number, number];

export type IsoRenderOptions = {
  width?: number;
  height?: number;
  padding?: number;
  viewDir?: Vec3;
  background?: Vec3;
  backgroundAlpha?: number;
  baseColor?: Vec3;
  lightDir?: Vec3;
  ambient?: number;
  diffuse?: number;
  wireframe?: boolean;
  wireColor?: Vec3;
  wireDepthTest?: boolean;
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function renderIsometricPng(
  mesh: MeshData,
  opts: IsoRenderOptions = {}
): Buffer {
  if (!mesh || !Array.isArray(mesh.positions) || mesh.positions.length === 0) {
    throw new Error("Mesh positions are required for rendering");
  }

  const width = Math.max(32, Math.floor(opts.width ?? 1200));
  const height = Math.max(32, Math.floor(opts.height ?? 900));
  const padding = Math.max(4, Math.floor(opts.padding ?? Math.min(width, height) * 0.06));
  const background = opts.background ?? [255, 255, 255];
  const backgroundAlpha = clamp(opts.backgroundAlpha ?? 0, 0, 1);
  const baseColor = opts.baseColor ?? [154, 192, 230];
  const ambient = clamp(opts.ambient ?? 0.35, 0, 1);
  const diffuse = clamp(opts.diffuse ?? 0.65, 0, 1);
  const wireframe = opts.wireframe !== false;
  const wireColor = opts.wireColor ?? [32, 40, 52];
  const wireDepthTest = opts.wireDepthTest !== false;

  const viewDir = normalize(opts.viewDir ?? [1, 1, -1]);
  const worldUp: Vec3 = [0, 0, 1];
  let right = normalize(cross(worldUp, viewDir));
  if (length(right) < 1e-6) right = normalize(cross([0, 1, 0], viewDir));
  const up = normalize(cross(viewDir, right));

  const positions = mesh.positions;
  const vertexCount = Math.floor(positions.length / 3);
  if (vertexCount === 0) throw new Error("Mesh has no vertices");

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const center: Vec3 = [
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  ];

  const viewX = new Float32Array(vertexCount);
  const viewY = new Float32Array(vertexCount);
  const viewZ = new Float32Array(vertexCount);
  let viewMinX = Infinity;
  let viewMinY = Infinity;
  let viewMaxX = -Infinity;
  let viewMaxY = -Infinity;

  for (let i = 0; i < vertexCount; i += 1) {
    const idx = i * 3;
    const px = (positions[idx] ?? 0) - center[0];
    const py = (positions[idx + 1] ?? 0) - center[1];
    const pz = (positions[idx + 2] ?? 0) - center[2];
    const vx = dot(right, [px, py, pz]);
    const vy = dot(up, [px, py, pz]);
    const vz = dot(viewDir, [px, py, pz]);
    viewX[i] = vx;
    viewY[i] = vy;
    viewZ[i] = vz;
    if (vx < viewMinX) viewMinX = vx;
    if (vy < viewMinY) viewMinY = vy;
    if (vx > viewMaxX) viewMaxX = vx;
    if (vy > viewMaxY) viewMaxY = vy;
  }

  const spanX = Math.max(1e-6, viewMaxX - viewMinX);
  const spanY = Math.max(1e-6, viewMaxY - viewMinY);
  const scale = Math.min(
    (width - padding * 2) / spanX,
    (height - padding * 2) / spanY
  );
  const viewMidX = (viewMinX + viewMaxX) * 0.5;
  const viewMidY = (viewMinY + viewMaxY) * 0.5;
  const screenCenterX = width * 0.5;
  const screenCenterY = height * 0.5;

  const screenX = new Float32Array(vertexCount);
  const screenY = new Float32Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) {
    const sx = screenCenterX + ((viewX[i] ?? 0) - viewMidX) * scale;
    const sy = screenCenterY - ((viewY[i] ?? 0) - viewMidY) * scale;
    screenX[i] = sx;
    screenY[i] = sy;
  }

  const normals = mesh.normals;
  const normalsOk = Array.isArray(normals) && normals.length === positions.length;
  const lightDirWorld = normalize(opts.lightDir ?? [0.35, 0.55, 1]);
  const lightDirView = normalize([
    dot(right, lightDirWorld),
    dot(up, lightDirWorld),
    dot(viewDir, lightDirWorld),
  ]);

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = background[0] ?? 0;
    rgba[i + 1] = background[1] ?? 0;
    rgba[i + 2] = background[2] ?? 0;
    rgba[i + 3] = Math.round(255 * backgroundAlpha);
  }

  const zBuffer = new Float32Array(width * height);
  zBuffer.fill(-Infinity);

  const indices = buildTriangleIndices(mesh, vertexCount);

  for (let t = 0; t + 2 < indices.length; t += 3) {
    const i0 = indices[t] ?? 0;
    const i1 = indices[t + 1] ?? 0;
    const i2 = indices[t + 2] ?? 0;
    if (i0 >= vertexCount || i1 >= vertexCount || i2 >= vertexCount) continue;

    const x0 = screenX[i0] ?? 0;
    const y0 = screenY[i0] ?? 0;
    const z0 = -(viewZ[i0] ?? 0);
    const x1 = screenX[i1] ?? 0;
    const y1 = screenY[i1] ?? 0;
    const z1 = -(viewZ[i1] ?? 0);
    const x2 = screenX[i2] ?? 0;
    const y2 = screenY[i2] ?? 0;
    const z2 = -(viewZ[i2] ?? 0);

    const denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
    if (Math.abs(denom) < 1e-6) continue;

    const shade = computeTriangleShade(
      i0,
      i1,
      i2,
      normalsOk ? normals : null,
      viewX,
      viewY,
      viewZ,
      right,
      up,
      viewDir,
      lightDirView
    );
    const intensity = clamp(ambient + diffuse * shade, 0, 1);
    const r = clampByte((baseColor[0] ?? 0) * intensity);
    const g = clampByte((baseColor[1] ?? 0) * intensity);
    const b = clampByte((baseColor[2] ?? 0) * intensity);

    const minPx = clampInt(Math.floor(Math.min(x0, x1, x2)), 0, width - 1);
    const maxPx = clampInt(Math.ceil(Math.max(x0, x1, x2)), 0, width - 1);
    const minPy = clampInt(Math.floor(Math.min(y0, y1, y2)), 0, height - 1);
    const maxPy = clampInt(Math.ceil(Math.max(y0, y1, y2)), 0, height - 1);
    for (let py = minPy; py <= maxPy; py += 1) {
      for (let px = minPx; px <= maxPx; px += 1) {
        const fx = px + 0.5;
        const fy = py + 0.5;
        const w0 = ((y1 - y2) * (fx - x2) + (x2 - x1) * (fy - y2)) / denom;
        const w1 = ((y2 - y0) * (fx - x2) + (x0 - x2) * (fy - y2)) / denom;
        const w2 = 1 - w0 - w1;
        const insidePositive = w0 >= 0 && w1 >= 0 && w2 >= 0;
        const insideNegative = w0 <= 0 && w1 <= 0 && w2 <= 0;
        if (!insidePositive && !insideNegative) continue;
        const z = w0 * z0 + w1 * z1 + w2 * z2;
        const idx = py * width + px;
        const prior = zBuffer[idx] ?? -Infinity;
        if (z <= prior) continue;
        zBuffer[idx] = z;
        const out = idx * 4;
        rgba[out] = r;
        rgba[out + 1] = g;
        rgba[out + 2] = b;
        rgba[out + 3] = 255;
      }
    }
  }

  if (wireframe) {
    const segments = resolveEdgeSegments(mesh, positions.length / 3);
    drawWireframe(
      segments,
      center,
      right,
      up,
      viewDir,
      viewMidX,
      viewMidY,
      scale,
      screenCenterX,
      screenCenterY,
      width,
      height,
      rgba,
      [wireColor[0] ?? 0, wireColor[1] ?? 0, wireColor[2] ?? 0, 255],
      zBuffer,
      wireDepthTest
    );
  }

  return writePng(width, height, rgba);
}

function buildTriangleIndices(mesh: MeshData, vertexCount: number): number[] {
  if (Array.isArray(mesh.indices) && mesh.indices.length >= 3) {
    return mesh.indices;
  }
  if (vertexCount % 3 !== 0) {
    throw new Error("Mesh indices missing and vertex count is not a multiple of 3");
  }
  const indices = new Array<number>(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) indices[i] = i;
  return indices;
}

function computeTriangleShade(
  i0: number,
  i1: number,
  i2: number,
  normals: number[] | null,
  viewX: Float32Array,
  viewY: Float32Array,
  viewZ: Float32Array,
  right: Vec3,
  up: Vec3,
  viewDir: Vec3,
  lightDir: Vec3
): number {
  let nx = 0;
  let ny = 0;
  let nz = 0;

  if (normals) {
    const n0 = readVec(normals, i0);
    const n1 = readVec(normals, i1);
    const n2 = readVec(normals, i2);
    const nWorld: Vec3 = [
      n0[0] + n1[0] + n2[0],
      n0[1] + n1[1] + n2[1],
      n0[2] + n1[2] + n2[2],
    ];
    const nLen = length(nWorld);
    if (nLen > 1e-6) {
      const inv = 1 / nLen;
      nWorld[0] *= inv;
      nWorld[1] *= inv;
      nWorld[2] *= inv;
      nx = dot(right, nWorld);
      ny = dot(up, nWorld);
      nz = dot(viewDir, nWorld);
    }
  } else {
    const ax = (viewX[i1] ?? 0) - (viewX[i0] ?? 0);
    const ay = (viewY[i1] ?? 0) - (viewY[i0] ?? 0);
    const az = (viewZ[i1] ?? 0) - (viewZ[i0] ?? 0);
    const bx = (viewX[i2] ?? 0) - (viewX[i0] ?? 0);
    const by = (viewY[i2] ?? 0) - (viewY[i0] ?? 0);
    const bz = (viewZ[i2] ?? 0) - (viewZ[i0] ?? 0);
    nx = ay * bz - az * by;
    ny = az * bx - ax * bz;
    nz = ax * by - ay * bx;
  }

  const nLen = Math.hypot(nx, ny, nz);
  if (nLen < 1e-6) return 0;
  const inv = 1 / nLen;
  nx *= inv;
  ny *= inv;
  nz *= inv;
  const dotNL = nx * lightDir[0] + ny * lightDir[1] + nz * lightDir[2];
  return Math.max(0, dotNL);
}

function resolveEdgeSegments(mesh: MeshData, vertexCount: number): number[] {
  if (Array.isArray(mesh.edgePositions) && mesh.edgePositions.length >= 6) {
    return mesh.edgePositions;
  }
  if (Array.isArray(mesh.indices) && mesh.indices.length >= 3) {
    const edges: number[] = [];
    for (let i = 0; i + 2 < mesh.indices.length; i += 3) {
      const a = mesh.indices[i] ?? 0;
      const b = mesh.indices[i + 1] ?? 0;
      const c = mesh.indices[i + 2] ?? 0;
      if (a >= vertexCount || b >= vertexCount || c >= vertexCount) continue;
      edges.push(a, b, b, c, c, a);
    }
    return edgesFromIndexPairs(mesh.positions, edges);
  }
  return [];
}

function edgesFromIndexPairs(positions: number[], pairs: number[]): number[] {
  const segments: number[] = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const ia = pairs[i] ?? 0;
    const ib = pairs[i + 1] ?? 0;
    const a = ia * 3;
    const b = ib * 3;
    segments.push(
      positions[a] ?? 0,
      positions[a + 1] ?? 0,
      positions[a + 2] ?? 0,
      positions[b] ?? 0,
      positions[b + 1] ?? 0,
      positions[b + 2] ?? 0
    );
  }
  return segments;
}

function drawWireframe(
  segments: number[],
  center: Vec3,
  right: Vec3,
  up: Vec3,
  viewDir: Vec3,
  viewMidX: number,
  viewMidY: number,
  scale: number,
  screenCenterX: number,
  screenCenterY: number,
  width: number,
  height: number,
  rgba: Buffer,
  color: [number, number, number, number],
  zBuffer: Float32Array,
  depthTest: boolean
): void {
  if (!Array.isArray(segments) || segments.length < 6) return;
  for (let i = 0; i + 5 < segments.length; i += 6) {
    const ax = (segments[i] ?? 0) - center[0];
    const ay = (segments[i + 1] ?? 0) - center[1];
    const az = (segments[i + 2] ?? 0) - center[2];
    const bx = (segments[i + 3] ?? 0) - center[0];
    const by = (segments[i + 4] ?? 0) - center[1];
    const bz = (segments[i + 5] ?? 0) - center[2];
    const axView = dot(right, [ax, ay, az]);
    const ayView = dot(up, [ax, ay, az]);
    const bxView = dot(right, [bx, by, bz]);
    const byView = dot(up, [bx, by, bz]);
    const azView = -dot(viewDir, [ax, ay, az]);
    const bzView = -dot(viewDir, [bx, by, bz]);
    const x0 = screenCenterX + (axView - viewMidX) * scale;
    const y0 = screenCenterY - (ayView - viewMidY) * scale;
    const x1 = screenCenterX + (bxView - viewMidX) * scale;
    const y1 = screenCenterY - (byView - viewMidY) * scale;
    drawLine(
      rgba,
      width,
      height,
      x0,
      y0,
      x1,
      y1,
      color,
      azView,
      bzView,
      zBuffer,
      depthTest
    );
  }
}

function drawLine(
  buffer: Buffer,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number, number],
  z0: number,
  z1: number,
  zBuffer: Float32Array,
  depthTest: boolean
): void {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  let ix1 = Math.round(x1);
  let iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  const steps = Math.max(dx, dy, 1);
  let err = dx - dy;
  let step = 0;
  while (true) {
    if (ix0 >= 0 && ix0 < width && iy0 >= 0 && iy0 < height) {
      const idx = iy0 * width + ix0;
      if (!depthTest) {
        const out = idx * 4;
        buffer[out] = color[0];
        buffer[out + 1] = color[1];
        buffer[out + 2] = color[2];
        buffer[out + 3] = color[3];
      } else {
        const t = steps <= 1 ? 0 : step / steps;
        const z = z0 + (z1 - z0) * t;
        const depth = zBuffer[idx] ?? -Infinity;
        if (z >= depth - 1e-3) {
          const out = idx * 4;
          buffer[out] = color[0];
          buffer[out + 1] = color[1];
          buffer[out + 2] = color[2];
          buffer[out + 3] = color[3];
        }
      }
    }
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
    step += 1;
  }
}

function readVec(arr: number[], index: number): Vec3 {
  const i = index * 3;
  return [arr[i] ?? 0, arr[i + 1] ?? 0, arr[i + 2] ?? 0];
}

function writePng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw);
  const chunks = [
    makeChunk("IHDR", makeIHDR(width, height)),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat([PNG_SIGNATURE, ...chunks]);
}

function makeIHDR(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuf, data]));
  crc.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i] ?? 0;
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function normalize(vec: Vec3): Vec3 {
  const len = length(vec);
  if (len < 1e-6) return [0, 0, 0];
  return [vec[0] / len, vec[1] / len, vec[2] / len];
}

function length(vec: Vec3): number {
  return Math.hypot(vec[0], vec[1], vec[2]);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
