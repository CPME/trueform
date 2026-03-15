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
  baseAlpha?: number;
  lightDir?: Vec3;
  ambient?: number;
  diffuse?: number;
  wireframe?: boolean;
  wireColor?: Vec3;
  wireDepthTest?: boolean;
};

export type IsoRenderLayer = {
  mesh: MeshData;
  baseColor?: Vec3;
  baseAlpha?: number;
  screenSpaceTint?: boolean;
  wireframe?: boolean;
  wireColor?: Vec3;
  wireDepthTest?: boolean;
  depthTest?: boolean;
};

type TransparentTriangle = {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  x2: number;
  y2: number;
  z2: number;
  denom: number;
  minPx: number;
  maxPx: number;
  minPy: number;
  maxPy: number;
  r: number;
  g: number;
  b: number;
  alpha: number;
  depthTest: boolean;
  depthBias: number;
};

type QueuedTransparentLayer = {
  triangles: TransparentTriangle[];
  wireframe:
    | {
        segments: number[];
        color: [number, number, number, number];
        wireDepthTest: boolean;
      }
    | null;
};

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function renderIsometricPng(
  mesh: MeshData,
  opts: IsoRenderOptions = {}
): Buffer {
  return renderIsometricPngLayers([{ mesh }], opts);
}

export function renderIsometricPngLayers(
  layers: IsoRenderLayer[],
  opts: IsoRenderOptions = {}
): Buffer {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error("At least one render layer is required");
  }
  for (const layer of layers) {
    if (!layer.mesh) {
      throw new Error("Render layer mesh is required");
    }
    const hasPositions = Array.isArray(layer.mesh.positions);
    const hasEdges = Array.isArray(layer.mesh.edgePositions);
    if (!hasPositions && !hasEdges) {
      throw new Error("Render layer requires mesh positions or edge positions");
    }
  }

  const width = Math.max(32, Math.floor(opts.width ?? 1200));
  const height = Math.max(32, Math.floor(opts.height ?? 900));
  const padding = Math.max(4, Math.floor(opts.padding ?? Math.min(width, height) * 0.06));
  const background = opts.background ?? [255, 255, 255];
  const backgroundAlpha = clamp(opts.backgroundAlpha ?? 0, 0, 1);
  const ambient = clamp(opts.ambient ?? 0.35, 0, 1);
  const diffuse = clamp(opts.diffuse ?? 0.65, 0, 1);

  const viewDir = normalize(opts.viewDir ?? [1, 1, -1]);
  const worldUp: Vec3 = [0, 0, 1];
  let right = normalize(cross(worldUp, viewDir));
  if (length(right) < 1e-6) right = normalize(cross([0, 1, 0], viewDir));
  const up = normalize(cross(viewDir, right));

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const layer of layers) {
    extendBounds(layer.mesh.positions, 3);
    extendBounds(layer.mesh.edgePositions, 3);
    extendBounds(layer.mesh.edgePositions, 6);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new Error("Render layers have no vertices");
  }
  const center: Vec3 = [
    (minX + maxX) * 0.5,
    (minY + maxY) * 0.5,
    (minZ + maxZ) * 0.5,
  ];

  let viewMinX = Infinity;
  let viewMinY = Infinity;
  let viewMaxX = -Infinity;
  let viewMaxY = -Infinity;
  for (const layer of layers) {
    extendViewBounds(layer.mesh.positions, 3);
    extendViewBounds(layer.mesh.edgePositions, 3);
    extendViewBounds(layer.mesh.edgePositions, 6);
  }

  function extendBounds(values: number[] | undefined, stride: number): void {
    if (!Array.isArray(values) || values.length < 3) return;
    for (let i = 0; i + 2 < values.length; i += stride) {
      const x = values[i] ?? 0;
      const y = values[i + 1] ?? 0;
      const z = values[i + 2] ?? 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }

  function extendViewBounds(values: number[] | undefined, stride: number): void {
    if (!Array.isArray(values) || values.length < 3) return;
    for (let i = 0; i + 2 < values.length; i += stride) {
      const px = (values[i] ?? 0) - center[0];
      const py = (values[i + 1] ?? 0) - center[1];
      const pz = (values[i + 2] ?? 0) - center[2];
      const vx = dot(right, [px, py, pz]);
      const vy = dot(up, [px, py, pz]);
      if (vx < viewMinX) viewMinX = vx;
      if (vy < viewMinY) viewMinY = vy;
      if (vx > viewMaxX) viewMaxX = vx;
      if (vy > viewMaxY) viewMaxY = vy;
    }
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

  const globalZ = new Float32Array(width * height);
  globalZ.fill(-Infinity);
  const transparentLayers: QueuedTransparentLayer[] = [];
  const sceneSpan = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  const transparentDepthBias = sceneSpan * 1e-4;

  for (const layer of layers) {
    const mesh = layer.mesh;
    const positions = Array.isArray(mesh.positions) ? mesh.positions : [];
    const vertexCount = Math.floor(positions.length / 3);

    const normals = mesh.normals;
    const normalsOk = Array.isArray(normals) && normals.length === positions.length;
    const baseColor = layer.baseColor ?? opts.baseColor ?? [154, 192, 230];
    const baseAlpha = clamp(layer.baseAlpha ?? opts.baseAlpha ?? 1, 0, 1);
    const screenSpaceTint = layer.screenSpaceTint === true && baseAlpha > 0;
    const wireframe = layer.wireframe ?? opts.wireframe ?? true;
    const wireColor = layer.wireColor ?? opts.wireColor ?? [32, 40, 52];
    const wireDepthTest = layer.wireDepthTest ?? opts.wireDepthTest ?? true;
    const depthTest = layer.depthTest !== false;
    const fillZBuffer = depthTest
      ? globalZ
      : new Float32Array(width * height).fill(-Infinity);
    const isTransparentFill = (baseAlpha > 0 && baseAlpha < 1) || screenSpaceTint;

    const layerTransparentTriangles: TransparentTriangle[] = [];

    if (vertexCount > 0) {
      const viewX = new Float32Array(vertexCount);
      const viewY = new Float32Array(vertexCount);
      const viewZ = new Float32Array(vertexCount);
      const screenX = new Float32Array(vertexCount);
      const screenY = new Float32Array(vertexCount);
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
        screenX[i] = screenCenterX + (vx - viewMidX) * scale;
        screenY[i] = screenCenterY - (vy - viewMidY) * scale;
      }

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
        if (baseAlpha <= 0) continue;

        const intensity = screenSpaceTint
          ? 1
          : isTransparentFill
          ? 1
          : clamp(
              ambient +
                diffuse *
                  computeTriangleShade(
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
                  ),
              0,
              1
            );
        const r = clampByte((baseColor[0] ?? 0) * intensity);
        const g = clampByte((baseColor[1] ?? 0) * intensity);
        const b = clampByte((baseColor[2] ?? 0) * intensity);

        const minPx = clampInt(Math.floor(Math.min(x0, x1, x2)), 0, width - 1);
        const maxPx = clampInt(Math.ceil(Math.max(x0, x1, x2)), 0, width - 1);
        const minPy = clampInt(Math.floor(Math.min(y0, y1, y2)), 0, height - 1);
        const maxPy = clampInt(Math.ceil(Math.max(y0, y1, y2)), 0, height - 1);
        const triangle: TransparentTriangle = {
          x0,
          y0,
          z0,
          x1,
          y1,
          z1,
          x2,
          y2,
          z2,
          denom,
          minPx,
          maxPx,
          minPy,
          maxPy,
          r,
          g,
          b,
          alpha: baseAlpha,
          depthTest: screenSpaceTint ? false : depthTest,
          depthBias:
            !screenSpaceTint && isTransparentFill && depthTest ? transparentDepthBias : 0,
        };
        if (isTransparentFill) {
          layerTransparentTriangles.push(triangle);
          continue;
        }
        rasterizeTriangle(rgba, width, triangle, fillZBuffer, fillZBuffer);
      }
    }

    let transparentWireframe: QueuedTransparentLayer["wireframe"] = null;
    if (wireframe) {
      const segments = resolveEdgeSegments(mesh, positions.length / 3);
      const color: [number, number, number, number] = [
        wireColor[0] ?? 0,
        wireColor[1] ?? 0,
        wireColor[2] ?? 0,
        255,
      ];
      if (isTransparentFill) {
        transparentWireframe = {
          segments,
          color,
          wireDepthTest,
        };
      } else {
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
        color,
          fillZBuffer,
        wireDepthTest
        );
      }
    }

    if (isTransparentFill) {
      transparentLayers.push({
        triangles: layerTransparentTriangles,
        wireframe: transparentWireframe,
      });
    }
  }

  for (const layer of transparentLayers) {
    const transparentZ = new Float32Array(width * height);
    transparentZ.fill(-Infinity);
    const transparentPixels = Buffer.alloc(width * height * 4);
    for (const triangle of layer.triangles) {
      captureTransparentTriangle(
        width,
        triangle,
        triangle.depthTest ? globalZ : null,
        transparentZ,
        transparentPixels
      );
    }
    for (let i = 0; i < transparentPixels.length; i += 4) {
      const alphaByte = transparentPixels[i + 3] ?? 0;
      if (alphaByte <= 0) continue;
      blendPixel(
        rgba,
        i,
        transparentPixels[i] ?? 0,
        transparentPixels[i + 1] ?? 0,
        transparentPixels[i + 2] ?? 0,
        alphaByte / 255
      );
    }
    if (layer.wireframe) {
      drawWireframe(
        layer.wireframe.segments,
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
        layer.wireframe.color,
        globalZ,
        layer.wireframe.wireDepthTest
      );
    }
  }

  return writePng(width, height, rgba);
}

function rasterizeTriangle(
  rgba: Buffer,
  width: number,
  triangle: TransparentTriangle,
  testBuffer: Float32Array | null,
  writeBuffer: Float32Array | null
): void {
  for (let py = triangle.minPy; py <= triangle.maxPy; py += 1) {
    for (let px = triangle.minPx; px <= triangle.maxPx; px += 1) {
      const fx = px + 0.5;
      const fy = py + 0.5;
      const w0 =
        ((triangle.y1 - triangle.y2) * (fx - triangle.x2) +
          (triangle.x2 - triangle.x1) * (fy - triangle.y2)) /
        triangle.denom;
      const w1 =
        ((triangle.y2 - triangle.y0) * (fx - triangle.x2) +
          (triangle.x0 - triangle.x2) * (fy - triangle.y2)) /
        triangle.denom;
      const w2 = 1 - w0 - w1;
      const insidePositive = w0 >= 0 && w1 >= 0 && w2 >= 0;
      const insideNegative = w0 <= 0 && w1 <= 0 && w2 <= 0;
      if (!insidePositive && !insideNegative) continue;
      const z =
        w0 * triangle.z0 + w1 * triangle.z1 + w2 * triangle.z2 + triangle.depthBias;
      const idx = py * width + px;
      const prior = testBuffer?.[idx] ?? -Infinity;
      if (z < prior - 1e-6) continue;
      if (writeBuffer) writeBuffer[idx] = z;
      blendPixel(rgba, idx * 4, triangle.r, triangle.g, triangle.b, triangle.alpha);
    }
  }
}

function captureTransparentTriangle(
  width: number,
  triangle: TransparentTriangle,
  opaqueDepth: Float32Array | null,
  transparentDepth: Float32Array,
  transparentPixels: Buffer
): void {
  for (let py = triangle.minPy; py <= triangle.maxPy; py += 1) {
    for (let px = triangle.minPx; px <= triangle.maxPx; px += 1) {
      const fx = px + 0.5;
      const fy = py + 0.5;
      const w0 =
        ((triangle.y1 - triangle.y2) * (fx - triangle.x2) +
          (triangle.x2 - triangle.x1) * (fy - triangle.y2)) /
        triangle.denom;
      const w1 =
        ((triangle.y2 - triangle.y0) * (fx - triangle.x2) +
          (triangle.x0 - triangle.x2) * (fy - triangle.y2)) /
        triangle.denom;
      const w2 = 1 - w0 - w1;
      const insidePositive = w0 >= 0 && w1 >= 0 && w2 >= 0;
      const insideNegative = w0 <= 0 && w1 <= 0 && w2 <= 0;
      if (!insidePositive && !insideNegative) continue;
      const z = w0 * triangle.z0 + w1 * triangle.z1 + w2 * triangle.z2;
      const idx = py * width + px;
      const opaque = opaqueDepth?.[idx] ?? -Infinity;
      if (z < opaque - 1e-6) continue;
      const prior = transparentDepth[idx] ?? -Infinity;
      if (z < prior - 1e-6) continue;
      transparentDepth[idx] = z;
      const offset = idx * 4;
      transparentPixels[offset] = triangle.r;
      transparentPixels[offset + 1] = triangle.g;
      transparentPixels[offset + 2] = triangle.b;
      transparentPixels[offset + 3] = clampByte(triangle.alpha * 255);
    }
  }
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

function blendPixel(
  buffer: Buffer,
  offset: number,
  r: number,
  g: number,
  b: number,
  alpha: number
): void {
  const a = clamp(alpha, 0, 1);
  if (a <= 0) return;
  if (a >= 1) {
    buffer[offset] = r;
    buffer[offset + 1] = g;
    buffer[offset + 2] = b;
    buffer[offset + 3] = 255;
    return;
  }
  const dstA = (buffer[offset + 3] ?? 0) / 255;
  const outA = a + dstA * (1 - a);
  if (outA <= 1e-6) {
    buffer[offset + 3] = 0;
    return;
  }
  const dstR = buffer[offset] ?? 0;
  const dstG = buffer[offset + 1] ?? 0;
  const dstB = buffer[offset + 2] ?? 0;
  const outR = (r * a + dstR * dstA * (1 - a)) / outA;
  const outG = (g * a + dstG * dstA * (1 - a)) / outA;
  const outB = (b * a + dstB * dstA * (1 - a)) / outA;
  buffer[offset] = clampByte(outR);
  buffer[offset + 1] = clampByte(outG);
  buffer[offset + 2] = clampByte(outB);
  buffer[offset + 3] = clampByte(outA * 255);
}
