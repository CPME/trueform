import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../dist/backend_occt.js";
import { dsl } from "../dist/dsl.js";
import { buildPart } from "../dist/executor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "viewer", "assets");
const pngPath = path.join(outDir, "sphere_intersection.png");
const debugPath = path.join(outDir, "sphere_intersection.debug.json");

function newOcct(occt, name, ...args) {
  const candidates = [name];
  for (let i = 1; i <= 25; i += 1) candidates.push(`${name}_${i}`);
  for (const key of candidates) {
    const Ctor = occt[key];
    if (!Ctor) continue;
    try {
      return new Ctor(...args);
    } catch {
      continue;
    }
  }
  throw new Error(`no constructor for ${name}`);
}

function makePnt(occt, x, y, z) {
  if (occt.gp_Pnt_3) return new occt.gp_Pnt_3(x, y, z);
  throw new Error("gp_Pnt_3 not available");
}

function makeSphere(occt, center, radius) {
  const pnt = makePnt(occt, center[0], center[1], center[2]);
  return newOcct(occt, "BRepPrimAPI_MakeSphere", pnt, radius);
}

function makeBooleanCommon(occt, left, right) {
  const progress = safeProgress(occt);
  const candidates = [
    [left, right, progress],
    [left, right],
  ];
  for (const args of candidates) {
    try {
      const builder = newOcct(occt, "BRepAlgoAPI_Common", ...args);
      tryBuild(builder, progress);
      return builder;
    } catch {
      continue;
    }
  }
  throw new Error("Failed to construct BRepAlgoAPI_Common");
}

function safeProgress(occt) {
  try {
    return newOcct(occt, "Message_ProgressRange_1");
  } catch {
    return null;
  }
}

function tryBuild(builder, progress) {
  if (!builder) return;
  let built = false;
  if (typeof builder.Build === "function") {
    if (progress) {
      try {
        builder.Build(progress);
        built = true;
      } catch {
        // fall through
      }
    }
    if (!built) {
      try {
        builder.Build();
        built = true;
      } catch {
        // ignore
      }
    }
  }

  if (!built && typeof builder.Perform === "function") {
    if (progress) {
      try {
        builder.Perform(progress);
        built = true;
      } catch {
        // fall through
      }
    }
    if (!built) {
      try {
        builder.Perform();
      } catch {
        // ignore
      }
    }
  }
}

function readShape(builder) {
  if (builder.Shape) return builder.Shape();
  if (builder.shape) return builder.shape();
  throw new Error("builder has no Shape()");
}

function countShapes(occt, shape, type) {
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(shape, type, occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count = 0;
  for (; explorer.More(); explorer.Next()) count += 1;
  return count;
}

function shapeStats(occt, shape) {
  return {
    faces: countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_FACE),
    edges: countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_EDGE),
    solids: countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_SOLID),
  };
}

function boundsFromEdges(edgePositions) {
  const min = [Infinity, Infinity];
  const max = [-Infinity, -Infinity];
  for (let i = 0; i + 5 < edgePositions.length; i += 6) {
    const ax = edgePositions[i];
    const ay = edgePositions[i + 1];
    const bx = edgePositions[i + 3];
    const by = edgePositions[i + 4];
    if (ax < min[0]) min[0] = ax;
    if (ay < min[1]) min[1] = ay;
    if (bx < min[0]) min[0] = bx;
    if (by < min[1]) min[1] = by;
    if (ax > max[0]) max[0] = ax;
    if (ay > max[1]) max[1] = ay;
    if (bx > max[0]) max[0] = bx;
    if (by > max[1]) max[1] = by;
  }
  return { min, max };
}

function edgesFromTriangles(positions, indices) {
  const edges = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    if (
      ia < 0 || ib < 0 || ic < 0 ||
      ia + 2 >= positions.length ||
      ib + 2 >= positions.length ||
      ic + 2 >= positions.length
    ) {
      continue;
    }
    const ax = positions[ia];
    const ay = positions[ia + 1];
    const az = positions[ia + 2];
    const bx = positions[ib];
    const by = positions[ib + 1];
    const bz = positions[ib + 2];
    const cx = positions[ic];
    const cy = positions[ic + 1];
    const cz = positions[ic + 2];
    edges.push(ax, ay, az, bx, by, bz);
    edges.push(bx, by, bz, cx, cy, cz);
    edges.push(cx, cy, cz, ax, ay, az);
  }
  return edges;
}

function edgesFromPoints(positions) {
  const edges = [];
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    edges.push(x, y, z, x, y, z);
  }
  return edges;
}

function drawLine(buffer, width, height, x0, y0, x1, y1, color) {
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  let ix1 = Math.round(x1);
  let iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    if (ix0 >= 0 && ix0 < width && iy0 >= 0 && iy0 < height) {
      const idx = (iy0 * width + ix0) * 4;
      buffer[idx] = color[0];
      buffer[idx + 1] = color[1];
      buffer[idx + 2] = color[2];
      buffer[idx + 3] = color[3];
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
  }
}

function writePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type 0
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  const compressed = zlib.deflateSync(raw);
  const chunks = [];

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  chunks.push(makeChunk("IHDR", ihdr));
  chunks.push(makeChunk("IDAT", compressed));
  chunks.push(makeChunk("IEND", Buffer.alloc(0)));

  return Buffer.concat([signature, ...chunks]);
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuf, data]));
  crc.writeUInt32BE(crcValue >>> 0, 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

try {
  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });

  const radius = 20;
  const sphereA = makeSphere(occt, [0, 0, 0], radius);
  const sphereB = makeSphere(occt, [14, 0, 0], radius);
  const sphereStats = {
    a: shapeStats(occt, sphereA.Shape()),
    b: shapeStats(occt, sphereB.Shape()),
  };
  const commonSelf = makeBooleanCommon(occt, sphereA.Shape(), sphereA.Shape());
  const commonSelfShape = readShape(commonSelf);
  const commonSelfStats = shapeStats(occt, commonSelfShape);
  const common = makeBooleanCommon(occt, sphereA.Shape(), sphereB.Shape());
  let shape = readShape(common);
  let preMeshStats = shapeStats(occt, shape);
  let fallbackUsed = false;
  if (preMeshStats.solids === 0) {
    const part = dsl.part("cyl-intersect", [
      dsl.extrude("a", dsl.profileCircle(20), 40, "body:a"),
      dsl.extrude(
        "b",
        dsl.profileCircle(20, [12, 0, 0]),
        40,
        "body:b"
      ),
      dsl.booleanOp(
        "common",
        "intersect",
        dsl.selectorNamed("body:a"),
        dsl.selectorNamed("body:b"),
        "body:main",
        ["a", "b"]
      ),
    ]);
    const result = buildPart(part, backend);
    const body = result.final.outputs.get("body:main");
    if (!body) {
      throw new Error("Fallback boolean intersection missing body:main output");
    }
    shape = body.meta["shape"];
    preMeshStats = shapeStats(occt, shape);
    fallbackUsed = true;
  }

  const mesh = backend.mesh({ id: "sphere-intersection", kind: "solid", meta: { shape } }, {
    linearDeflection: 0.6,
    angularDeflection: 0.6,
    parallel: true,
  });

  await fs.mkdir(outDir, { recursive: true });

  const meshStats = {
    vertices: mesh.positions.length / 3,
    triangles: (mesh.indices?.length ?? 0) / 3,
    edgePositions: mesh.edgePositions?.length ?? 0,
  };
  console.log(
    JSON.stringify(
      {
        sphere: sphereStats,
        commonSelf: commonSelfStats,
        shape: preMeshStats,
        mesh: meshStats,
        fallbackUsed,
      },
      null,
      2
    )
  );

  let edgePositions = mesh.edgePositions ?? [];
  let edgeSource = "brep";
  if (edgePositions.length === 0 && Array.isArray(mesh.indices) && mesh.indices.length > 0) {
    edgePositions = edgesFromTriangles(mesh.positions, mesh.indices);
    edgeSource = "triangles";
  }
  if (edgePositions.length === 0 && mesh.positions.length > 0) {
    edgePositions = edgesFromPoints(mesh.positions);
    edgeSource = "points";
  }
  if (edgePositions.length === 0) {
    throw new Error("No edge positions generated for intersection mesh");
  }

  const width = 1000;
  const height = 800;
  const bg = [250, 248, 245, 255];
  const fg = [31, 26, 20, 255];

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = bg[0];
    rgba[i + 1] = bg[1];
    rgba[i + 2] = bg[2];
    rgba[i + 3] = bg[3];
  }

  const bounds = boundsFromEdges(edgePositions);
  const minX = bounds.min[0];
  const minY = bounds.min[1];
  const maxX = bounds.max[0];
  const maxY = bounds.max[1];
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const pad = 40;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);

  for (let i = 0; i + 5 < edgePositions.length; i += 6) {
    const ax = edgePositions[i];
    const ay = edgePositions[i + 1];
    const bx = edgePositions[i + 3];
    const by = edgePositions[i + 4];

    const x0 = pad + (ax - minX) * scale;
    const y0 = height - (pad + (ay - minY) * scale);
    const x1 = pad + (bx - minX) * scale;
    const y1 = height - (pad + (by - minY) * scale);

    drawLine(rgba, width, height, x0, y0, x1, y1, fg);
  }

  const png = writePng(width, height, rgba);
  await fs.writeFile(pngPath, png);

  const debug = {
    shapes: preMeshStats,
    mesh: {
      vertices: mesh.positions.length / 3,
      triangles: (mesh.indices?.length ?? 0) / 3,
      edgeSegments: edgePositions.length / 6,
      edgeSource,
    },
    fallbackUsed,
  };
  await fs.writeFile(debugPath, JSON.stringify(debug, null, 2));

  console.log(JSON.stringify({ png: pngPath, debug: debugPath }, null, 2));
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Sphere intersection export failed:", error.message);
  if (error.stack) console.error(error.stack.split("\n").slice(0, 8).join("\n"));
  process.exit(1);
}
