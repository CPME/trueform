import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { dsl } from "../../dist/index.js";
import { buildAssembly } from "../../dist/experimental.js";
import { createTfContainer } from "../../dist/tf/container.js";
import { buildPart } from "../../dist/executor.js";
import { assemblySimple } from "../../dist/examples/assembly_simple.js";
import { mechanicalCollection } from "../../dist/examples/mechanical_collection.js";
import { viewerPart } from "../../dist/examples/viewer_part.js";
import { renderIsometricPng } from "../../dist/viewer/isometric_renderer.js";
import { collectMeshAssets } from "../../dist/viewer/asset_manifest.js";
import {
  appendCosmeticThreadEdges,
  buildResolutionContext,
} from "../../dist/viewer/cosmetic_threads.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const distDir = path.join(repoRoot, "dist");
const outDir = path.join(__dirname, "assets");
const manifestPath = path.join(outDir, "manifest.json");
const sourcesDir = path.join(outDir, "sources");
const forceExport =
  process.env.TF_VIEWER_FORCE &&
  process.env.TF_VIEWER_FORCE !== "0" &&
  process.env.TF_VIEWER_FORCE !== "false";

const assemblyParts = assemblySimple.parts.map((part) => ({
  name: part.id,
  part,
  sourcePath: assemblySimple.sourcePath,
}));

const parts = [
  {
    name: "plate",
    part: viewerPart,
    sourcePath: "src/examples/viewer_part.ts",
    render: {
      width: 1400,
      height: 1000,
      viewDir: [1.15, 0.9, -0.85],
      background: [244, 245, 248],
      backgroundAlpha: 1,
      baseColor: [138, 176, 210],
      wireColor: [34, 44, 60],
      ambient: 0.4,
      diffuse: 0.7,
    },
  },
  ...assemblyParts,
  ...mechanicalCollection.map((entry) => ({
    name: entry.id,
    part: entry.part,
    sourcePath: entry.sourcePath,
    mesh:
      entry.id === "hex-tube-sweep"
        ? {
            linearDeflection: 0.2,
            angularDeflection: 0.35,
          }
        : undefined,
  })),
];

const assemblies = [
  {
    name: assemblySimple.id,
    title: assemblySimple.title,
    sourcePath: assemblySimple.sourcePath,
    assembly: assemblySimple.assembly,
    parts: assemblySimple.parts,
  },
];

const onlyEnv = process.env.TF_VIEWER_ONLY;
const only = onlyEnv
  ? onlyEnv
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
  : null;
const selectedAssemblies = only
  ? assemblies.filter((entry) => only.includes(entry.name))
  : assemblies;
const selectedParts = only
  ? parts.filter((entry) => {
      if (only.includes(entry.name)) return true;
      for (const asm of selectedAssemblies) {
        if (asm.parts.some((part) => part.id === entry.part.id)) return true;
      }
      return false;
    })
  : parts;

const axisIndex = { x: 0, y: 1, z: 2 };

async function statMtime(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    return stat.mtimeMs;
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

async function maxMtime(paths) {
  let latest = 0;
  for (const entry of paths) {
    const mtime = await statMtime(entry);
    if (mtime && mtime > latest) latest = mtime;
  }
  return latest;
}

async function minMtime(paths) {
  let oldest = Infinity;
  for (const entry of paths) {
    const mtime = await statMtime(entry);
    if (!mtime) return null;
    if (mtime < oldest) oldest = mtime;
  }
  return Number.isFinite(oldest) ? oldest : null;
}

async function readJson(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    return null;
  }
}

function isPrimitive(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function isPrimitiveArray(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === "string" || typeof entry === "number"
    )
  );
}

function serializeSelectionMeta(meta) {
  const output = {};
  if (!meta || typeof meta !== "object") return output;
  for (const [key, value] of Object.entries(meta)) {
    if (key === "shape" || key === "owner") continue;
    if (isPrimitive(value)) {
      output[key] = value;
      continue;
    }
    if (isPrimitiveArray(value)) {
      output[key] = value.slice();
    }
  }
  return output;
}

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

function countShapes(occt, shape, type) {
  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(shape, type, occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count = 0;
  for (; explorer.More(); explorer.Next()) count += 1;
  return count;
}

function edgeAdjacencyCounts(occt, shape) {
  const map = new occt.TopTools_IndexedDataMapOfShapeListOfShape_1();
  occt.TopExp.MapShapesAndAncestors(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_EDGE,
    occt.TopAbs_ShapeEnum.TopAbs_FACE,
    map
  );
  let single = 0;
  let two = 0;
  let multi = 0;
  for (let i = 1; i <= map.Extent(); i += 1) {
    const faces = map.FindFromIndex(i);
    const n = faces.Extent ? faces.Extent() : 0;
    if (n <= 1) single += 1;
    else if (n === 2) two += 1;
    else multi += 1;
  }
  return { edges: map.Extent(), single, two, multi };
}

function shapeBounds(occt, shape) {
  const box = newOcct(occt, "Bnd_Box");
  occt.BRepBndLib.Add(shape, box, true);
  const min = box.CornerMin();
  const max = box.CornerMax();
  return {
    min: [min.X(), min.Y(), min.Z()],
    max: [max.X(), max.Y(), max.Z()],
  };
}

function edgeBounds(edgePositions) {
  if (!Array.isArray(edgePositions) || edgePositions.length === 0) return null;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < edgePositions.length; i += 3) {
    const x = edgePositions[i];
    const y = edgePositions[i + 1];
    const z = edgePositions[i + 2];
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

function svgFromEdges(edgePositions, axisA, axisB) {
  if (!Array.isArray(edgePositions) || edgePositions.length === 0) return null;
  const ia = axisIndex[axisA];
  const ib = axisIndex[axisB];
  if (ia === undefined || ib === undefined) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let d = "";

  for (let i = 0; i + 5 < edgePositions.length; i += 6) {
    const ax = Number(edgePositions[i + ia]);
    const ay = -Number(edgePositions[i + ib]);
    const bx = Number(edgePositions[i + 3 + ia]);
    const by = -Number(edgePositions[i + 3 + ib]);

    if (![ax, ay, bx, by].every((value) => Number.isFinite(value))) {
      continue;
    }

    if (ax < minX) minX = ax;
    if (ay < minY) minY = ay;
    if (bx < minX) minX = bx;
    if (by < minY) minY = by;
    if (ax > maxX) maxX = ax;
    if (ay > maxY) maxY = ay;
    if (bx > maxX) maxX = bx;
    if (by > maxY) maxY = by;

    d += `M${ax.toFixed(3)} ${ay.toFixed(3)}L${bx.toFixed(3)} ${by.toFixed(3)} `;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const pad = Math.max(width, height) * 0.05;
  const viewBox = `${(minX - pad).toFixed(3)} ${(minY - pad).toFixed(3)} ${(
    width + pad * 2
  ).toFixed(3)} ${(height + pad * 2).toFixed(3)}`;
  const stroke = (Math.max(width, height) / 1200).toFixed(3);

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n` +
    `<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"${viewBox}\" ` +
    `width=\"800\" height=\"600\">\n` +
    `<rect x=\"${(minX - pad).toFixed(3)}\" y=\"${(minY - pad).toFixed(3)}\" ` +
    `width=\"${(width + pad * 2).toFixed(3)}\" height=\"${(height + pad * 2).toFixed(3)}\" ` +
    `fill=\"#faf8f5\" />\n` +
    `<path d=\"${d.trim()}\" fill=\"none\" stroke=\"#1f1a14\" ` +
    `stroke-width=\"${stroke}\" vector-effect=\"non-scaling-stroke\" />\n` +
    `</svg>\n`;
}

function edgePositionsFromPoints(points) {
  const segments = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    segments.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  return segments;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length3(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize3(v) {
  const len = length3(v);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function rotateAroundAxis(vec, axis, angle) {
  const n = normalize3(axis);
  const len = length3(n);
  if (len === 0) return vec;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const crossTerm = cross(n, vec);
  const dotTerm = dot(n, vec);
  return [
    vec[0] * cos + crossTerm[0] * sin + n[0] * dotTerm * (1 - cos),
    vec[1] * cos + crossTerm[1] * sin + n[1] * dotTerm * (1 - cos),
    vec[2] * cos + crossTerm[2] * sin + n[2] * dotTerm * (1 - cos),
  ];
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  const out = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const v0 = p0[i];
    const v1 = p1[i];
    const v2 = p2[i];
    const v3 = p3[i];
    out[i] =
      0.5 *
      (2 * v1 +
        (-v0 + v2) * t +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
  }
  return out;
}

function sampleSplinePoints(points, samplesPerSegment = 20) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const output = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];
    const steps = Math.max(4, samplesPerSegment);
    for (let j = 0; j < steps; j += 1) {
      const t = j / steps;
      output.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  output.push(points[points.length - 1]);
  return output;
}

function sampleArcPoints(start, end, center, direction, samplesPerSegment = 20) {
  const v1 = [start[0] - center[0], start[1] - center[1], start[2] - center[2]];
  const v2 = [end[0] - center[0], end[1] - center[1], end[2] - center[2]];
  const r1 = length3(v1);
  const r2 = length3(v2);
  if (!Number.isFinite(r1) || !Number.isFinite(r2) || r1 === 0 || r2 === 0) {
    return [start, end];
  }
  const axis = normalize3(cross(v1, v2));
  if (length3(axis) === 0) return [start, end];
  const dotVal = Math.max(-1, Math.min(1, dot(v1, v2) / (r1 * r2)));
  let angle = Math.acos(dotVal);
  if (direction === "cw") angle *= -1;
  const steps = Math.max(4, samplesPerSegment);
  const output = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const vec = rotateAroundAxis(v1, axis, angle * t);
    output.push([center[0] + vec[0], center[1] + vec[1], center[2] + vec[2]]);
  }
  return output;
}

function samplePathPoints(path) {
  if (!path || typeof path !== "object") return [];
  if (path.kind === "path.polyline") {
    return path.points ?? [];
  }
  if (path.kind === "path.spline") {
    return sampleSplinePoints(path.points ?? []);
  }
  if (path.kind === "path.segments") {
    const output = [];
    for (const segment of path.segments ?? []) {
      if (!segment) continue;
      if (segment.kind === "path.line") {
        if (output.length === 0) output.push(segment.start);
        output.push(segment.end);
        continue;
      }
      if (segment.kind === "path.arc") {
        const arcPoints = sampleArcPoints(
          segment.start,
          segment.end,
          segment.center,
          segment.direction
        );
        if (output.length > 0) {
          arcPoints.shift();
        }
        output.push(...arcPoints);
      }
    }
    return output;
  }
  return [];
}

function findSweepPath(part) {
  const features = part?.features ?? [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    if (feature.kind === "feature.hexTubeSweep" || feature.kind === "feature.pipeSweep") {
      return feature.path ?? null;
    }
  }
  return null;
}

try {
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(sourcesDir, { recursive: true });

  const coreInputs = [
    path.join(distDir, "backend_occt.js"),
    path.join(distDir, "index.js"),
    path.join(distDir, "dsl.js"),
    path.join(distDir, "executor.js"),
    path.join(distDir, "tf/container.js"),
    path.join(distDir, "viewer/isometric_renderer.js"),
    path.join(distDir, "viewer/asset_manifest.js"),
    path.join(distDir, "examples/mechanical_collection.js"),
    path.join(distDir, "examples/viewer_part.js"),
    path.join(__dirname, "export.mjs"),
  ];
  const coreMtime = await maxMtime(coreInputs);

  const entryStates = [];
  for (const entry of selectedParts) {
    const outPath = path.join(outDir, `${entry.name}.mesh.json`);
    const debugPath = path.join(outDir, `${entry.name}.debug.json`);
    const isoPath = path.join(outDir, `${entry.name}.iso.png`);
    const selectorsPath = path.join(outDir, `${entry.name}.selectors.json`);
    const tfpPath = path.join(outDir, `${entry.name}.tfp`);
    const sourceOut = entry.sourcePath
      ? path.join(sourcesDir, `${entry.name}.ts`)
      : null;
    const sourceAbs = entry.sourcePath
      ? path.join(repoRoot, entry.sourcePath)
      : null;
    const sweepPath = findSweepPath(entry.part);
    const pathSvgXY = sweepPath ? path.join(outDir, `${entry.name}.path.xy.svg`) : null;
    const pathSvgXZ = sweepPath ? path.join(outDir, `${entry.name}.path.xz.svg`) : null;
    const pathSvgYZ = sweepPath ? path.join(outDir, `${entry.name}.path.yz.svg`) : null;
    const sourceMtime = sourceAbs ? await statMtime(sourceAbs) : null;
    const inputMtime = Math.max(coreMtime, sourceMtime ?? 0);
    const requiredOutputs = [
      outPath,
      debugPath,
      isoPath,
      selectorsPath,
      tfpPath,
      ...(sourceOut ? [sourceOut] : []),
      ...(pathSvgXY ? [pathSvgXY, pathSvgXZ, pathSvgYZ] : []),
    ];
    const outputMtime = await minMtime(requiredOutputs);
    const upToDate =
      !forceExport && outputMtime !== null && outputMtime >= inputMtime;

    entryStates.push({
      entry,
      outPath,
      debugPath,
      isoPath,
      selectorsPath,
      tfpPath,
      sweepPath,
      pathSvgXY,
      pathSvgXZ,
      pathSvgYZ,
      sourceOut,
      sourceAbs,
      upToDate,
    });
  }

  const meshPathByPartId = new Map();
  for (const state of entryStates) {
    meshPathByPartId.set(state.entry.part.id, {
      outPath: state.outPath,
      assetPath: `./assets/${state.entry.name}.mesh.json`,
    });
  }

  const assemblyStates = [];
  for (const entry of selectedAssemblies) {
    const outPath = path.join(outDir, `${entry.name}.assembly.json`);
    const sourceAbs = entry.sourcePath
      ? path.join(repoRoot, entry.sourcePath)
      : null;
    const sourceMtime = sourceAbs ? await statMtime(sourceAbs) : null;
    let missingMesh = false;
    let meshLatest = 0;
    for (const part of entry.parts) {
      const meshPath =
        meshPathByPartId.get(part.id)?.outPath ??
        path.join(outDir, `${part.id}.mesh.json`);
      const mtime = await statMtime(meshPath);
      if (!mtime) {
        missingMesh = true;
        continue;
      }
      if (mtime > meshLatest) meshLatest = mtime;
    }
    const inputMtime = Math.max(coreMtime, sourceMtime ?? 0, meshLatest);
    const outputMtime = await statMtime(outPath);
    const upToDate =
      !forceExport &&
      !missingMesh &&
      outputMtime !== null &&
      outputMtime >= inputMtime;
    assemblyStates.push({
      entry,
      outPath,
      sourceAbs,
      sourceMtime,
      upToDate,
    });
  }

  const needsExport =
    entryStates.some((state) => !state.upToDate) ||
    assemblyStates.some((state) => !state.upToDate);
  const occt = needsExport ? await initOpenCascade() : null;
  const backend = occt ? new OcctBackend({ occt }) : null;

  const results = [];
  const topology = {};
  const builtParts = new Map();

  for (const state of entryStates) {
    const {
      entry,
      outPath,
      debugPath,
      isoPath,
      selectorsPath,
      tfpPath,
      sweepPath,
      pathSvgXY,
      pathSvgXZ,
      pathSvgYZ,
      sourceOut,
      sourceAbs,
      upToDate,
    } = state;

    if (upToDate) {
      const cachedDebug = await readJson(debugPath);
      if (cachedDebug?.shape) {
        topology[entry.name] = {
          faces: cachedDebug.shape.faces ?? 0,
          edges: cachedDebug.shape.edges ?? 0,
          solids: cachedDebug.shape.solids ?? 0,
        };
      }
      results.push({
        name: entry.name,
        output: outPath,
        iso: isoPath,
        debug: debugPath,
        selectors: selectorsPath,
        tfp: tfpPath,
        source: sourceOut ?? undefined,
        vertices: cachedDebug?.mesh?.vertices ?? undefined,
      });
      continue;
    }

    if (!backend || !occt) {
      throw new Error("OpenCascade backend unavailable for export.");
    }

    const result = buildPart(entry.part, backend);
    builtParts.set(entry.part.id, result);
    const body = result.final.outputs.get("body:main");
    if (!body) {
      throw new Error(`Missing body:main output for ${entry.name}`);
    }

    const mesh = backend.mesh(body, {
      linearDeflection: 0.5,
      angularDeflection: 0.5,
      parallel: true,
      ...(entry.mesh ?? {}),
    });
    const resolution = buildResolutionContext(result.final);
    const meshWithThreads = appendCosmeticThreadEdges(
      mesh,
      entry.part,
      resolution,
      occt
    );

    const meshJson = JSON.stringify(meshWithThreads);
    await fs.writeFile(outPath, meshJson);
    const isoPng = renderIsometricPng(meshWithThreads, {
      width: 1400,
      height: 1000,
      ...(entry.render ?? {}),
    });
    await fs.writeFile(isoPath, isoPng);
    const shape = body.meta["shape"];
    const edgeAdjacency = edgeAdjacencyCounts(occt, shape);
    const faceCount = countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_FACE);
    const edgeCount = countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_EDGE);
    const solidCount = countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_SOLID);
    const debug = {
      shape: {
        faces: faceCount,
        edges: edgeCount,
        solids: solidCount,
        bounds: shapeBounds(occt, shape),
        edgeAdjacency,
      },
      mesh: {
        vertices: mesh.positions.length / 3,
        triangles: mesh.indices.length / 3,
        edgeSegments: (mesh.edgePositions?.length ?? 0) / 6,
        edgeBounds: edgeBounds(mesh.edgePositions),
      },
    };
    const debugJson = JSON.stringify(debug, null, 2);
    await fs.writeFile(debugPath, debugJson);
    topology[entry.name] = {
      faces: debug.shape.faces,
      edges: debug.shape.edges,
      solids: debug.shape.solids,
    };

    const selections = result.final.selections.map((selection) => ({
      id: selection.id,
      kind: selection.kind,
      meta: serializeSelectionMeta(selection.meta),
    }));
    const selectionSummary = selections.reduce(
      (acc, selection) => {
        acc.total += 1;
        acc.byKind[selection.kind] =
          (acc.byKind[selection.kind] || 0) + 1;
        return acc;
      },
      { total: 0, byKind: {} }
    );
    const selectorsJson = JSON.stringify(
      { selections, summary: selectionSummary },
      null,
      2
    );
    await fs.writeFile(selectorsPath, selectorsJson);

    const svgXY = svgFromEdges(mesh.edgePositions, "x", "y");
    const svgXZ = svgFromEdges(mesh.edgePositions, "x", "z");
    const svgYZ = svgFromEdges(mesh.edgePositions, "y", "z");
    if (svgXY) {
      await fs.writeFile(
        path.join(outDir, `${entry.name}.edges.xy.svg`),
        svgXY
      );
    }
    if (svgXZ) {
      await fs.writeFile(
        path.join(outDir, `${entry.name}.edges.xz.svg`),
        svgXZ
      );
    }
    if (svgYZ) {
      await fs.writeFile(
        path.join(outDir, `${entry.name}.edges.yz.svg`),
        svgYZ
      );
    }

    if (sweepPath && pathSvgXY && pathSvgXZ && pathSvgYZ) {
      const pathPoints = samplePathPoints(sweepPath);
      const pathEdges = edgePositionsFromPoints(pathPoints);
      const pathXY = svgFromEdges(pathEdges, "x", "y");
      const pathXZ = svgFromEdges(pathEdges, "x", "z");
      const pathYZ = svgFromEdges(pathEdges, "y", "z");
      if (pathXY) await fs.writeFile(pathSvgXY, pathXY);
      if (pathXZ) await fs.writeFile(pathSvgXZ, pathXZ);
      if (pathYZ) await fs.writeFile(pathSvgYZ, pathYZ);
    }

    if (sourceAbs && sourceOut) {
      const sourceText = await fs.readFile(sourceAbs, "utf8");
      await fs.writeFile(sourceOut, sourceText);
    }

    const artifacts = [
      {
        type: "mesh",
        path: "artifacts/part.mesh.json",
        data: meshJson,
      },
      {
        type: "preview",
        path: "artifacts/preview.png",
        data: isoPng,
      },
    ];
    const document = dsl.document(`${entry.name}-doc`, [entry.part], dsl.context());
    const tfBytes = await createTfContainer(document, artifacts);
    await fs.writeFile(tfpPath, tfBytes);

    results.push({
      name: entry.name,
      output: outPath,
      iso: isoPath,
      debug: debugPath,
      selectors: selectorsPath,
      tfp: tfpPath,
      source: sourceOut ?? undefined,
      vertices: mesh.positions.length / 3,
    });
  }

  const meshByPartId = new Map();
  for (const [partId, paths] of meshPathByPartId.entries()) {
    meshByPartId.set(partId, paths.assetPath);
  }

  for (const state of assemblyStates) {
    const { entry, outPath, upToDate } = state;

    if (upToDate) {
      results.push({
        name: entry.name,
        assembly: outPath,
      });
      continue;
    }

    if (!backend) {
      throw new Error("OpenCascade backend unavailable for assembly export.");
    }

    const partResults = entry.parts.map((part) => {
      const cached = builtParts.get(part.id);
      if (cached) return cached;
      const built = buildPart(part, backend);
      builtParts.set(part.id, built);
      return built;
    });

    const solved = buildAssembly(entry.assembly, partResults);
    const palette = ["#c7a884", "#7aa6c2", "#d0b48a", "#9fb6c9"];
    const instances = solved.instances.map((inst, idx) => {
      const mesh = meshByPartId.get(inst.part);
      if (!mesh) {
        throw new Error(`Missing mesh asset for assembly part ${inst.part}`);
      }
      return {
        id: inst.id,
        part: inst.part,
        mesh,
        transform: inst.transform,
        color: palette[idx % palette.length],
      };
    });

    const payload = {
      kind: "assembly",
      id: entry.assembly?.id ?? entry.name,
      title: entry.title,
      converged: solved.converged,
      iterations: solved.iterations,
      residual: solved.residual,
      instances,
    };

    await fs.writeFile(outPath, JSON.stringify(payload, null, 2));
    results.push({
      name: entry.name,
      assembly: outPath,
      instances: instances.length,
      converged: solved.converged,
    });
  }

  const assetEntries = await fs.readdir(outDir);
  const meshAssets = collectMeshAssets(assetEntries).map(
    (name) => `./assets/${name}`
  );
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ assets: meshAssets }, null, 2)
  );
  await fs.writeFile(
    path.join(outDir, "topology.json"),
    JSON.stringify({ parts: topology }, null, 2)
  );
  console.log(JSON.stringify({ manifest: manifestPath, assets: results }, null, 2));
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Export failed:", error.message);
  if (error.stack) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
}
