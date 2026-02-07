import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { buildPart } from "../../dist/executor.js";
import { viewerPart } from "../../dist/examples/viewer_part.js";
import { renderIsometricPng } from "../../dist/viewer/isometric_renderer.js";
import { collectMeshAssets } from "../../dist/viewer/asset_manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "assets");
const outPath = path.join(outDir, "plate.mesh.json");
const debugPath = path.join(outDir, "plate.debug.json");
const isoPath = path.join(outDir, "plate.iso.png");
const manifestPath = path.join(outDir, "manifest.json");

const part = viewerPart;

const axisIndex = { x: 0, y: 1, z: 2 };

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
    const ax = edgePositions[i + ia];
    const ay = -edgePositions[i + ib];
    const bx = edgePositions[i + 3 + ia];
    const by = -edgePositions[i + 3 + ib];

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

try {
  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });
  const result = buildPart(part, backend);
  const body = result.final.outputs.get("body:main");
  if (!body) {
    throw new Error("Missing body:main output");
  }

  await fs.mkdir(outDir, { recursive: true });
  const mesh = backend.mesh(body, {
    linearDeflection: 0.5,
    angularDeflection: 0.5,
    parallel: true,
  });

  await fs.writeFile(outPath, JSON.stringify(mesh));
  const isoPng = renderIsometricPng(mesh, { width: 1400, height: 1000 });
  await fs.writeFile(isoPath, isoPng);
  const shape = body.meta["shape"];
  const edgeAdjacency = edgeAdjacencyCounts(occt, shape);
  const debug = {
    shape: {
      faces: countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_FACE),
      edges: edgeAdjacency.edges,
      solids: countShapes(occt, shape, occt.TopAbs_ShapeEnum.TopAbs_SOLID),
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
  await fs.writeFile(debugPath, JSON.stringify(debug, null, 2));

  const svgXY = svgFromEdges(mesh.edgePositions, "x", "y");
  const svgXZ = svgFromEdges(mesh.edgePositions, "x", "z");
  const svgYZ = svgFromEdges(mesh.edgePositions, "y", "z");
  if (svgXY) await fs.writeFile(path.join(outDir, "plate.edges.xy.svg"), svgXY);
  if (svgXZ) await fs.writeFile(path.join(outDir, "plate.edges.xz.svg"), svgXZ);
  if (svgYZ) await fs.writeFile(path.join(outDir, "plate.edges.yz.svg"), svgYZ);
  const assetEntries = await fs.readdir(outDir);
  const meshAssets = collectMeshAssets(assetEntries).map(
    (name) => `./assets/${name}`
  );
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ assets: meshAssets }, null, 2)
  );
  console.log(
    JSON.stringify(
      {
        output: outPath,
        iso: isoPath,
        debug: debugPath,
        manifest: manifestPath,
        vertices: mesh.positions.length / 3,
      },
      null,
      2
    )
  );
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Export failed:", error.message);
  if (error.stack) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
}
