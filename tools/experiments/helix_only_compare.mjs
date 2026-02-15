import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { buildPart } from "../../dist/executor.js";
import { part } from "../../dist/dsl/core.js";
import {
  axisVector,
  datumPlane,
  pathLine,
  pathPolyline,
  pathSegments,
  pathSpline,
  planeDatum,
  profileRef,
  profileSketchLoop,
  sketch2d,
  sketchCircle,
  sweep,
} from "../../dist/dsl/geometry.js";
import { renderIsometricPng } from "../../dist/viewer/isometric_renderer.js";

function helixPoints({ radius, pitch, turns, samplesPerTurn }) {
  const points = [];
  const count = Math.max(24, Math.ceil(turns * samplesPerTurn));
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const angle = Math.PI * 2 * turns * t;
    points.push([
      radius * Math.cos(angle),
      radius * Math.sin(angle),
      pitch * turns * t,
    ]);
  }
  return points;
}

function lineSegments(points) {
  const segments = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (!start || !end) continue;
    segments.push(pathLine(start, end));
  }
  return segments;
}

function radiusStats(points) {
  let min = Infinity;
  let max = -Infinity;
  for (const pt of points) {
    const x = pt[0] ?? 0;
    const y = pt[1] ?? 0;
    const r = Math.hypot(x, y);
    if (r < min) min = r;
    if (r > max) max = r;
  }
  return {
    minRadius: Number(min.toFixed(6)),
    maxRadius: Number(max.toFixed(6)),
    span: Number((max - min).toExponential(3)),
  };
}

function makePart({ id, path, sweepOpts }) {
  const points = helixPoints(config);
  const start = points[0];
  if (!start) throw new Error("helix has no start point");
  const tangent = [0, config.radius, config.pitch / (2 * Math.PI)];
  const radial = [1, 0, 0];
  return part(id, [
    datumPlane("helix-start-plane", axisVector(tangent), start, undefined, {
      xAxis: axisVector(radial),
    }),
    sketch2d(
      "helix-profile",
      [
        {
          name: "profile:wire",
          profile: profileSketchLoop(["wire-circle"]),
        },
      ],
      {
        plane: planeDatum("helix-start-plane"),
        origin: start,
        entities: [sketchCircle("wire-circle", [0, 0], config.wireRadius)],
      }
    ),
    sweep(
      "helix-sweep",
      profileRef("profile:wire"),
      path,
      "body:main",
      undefined,
      sweepOpts
    ),
  ]);
}

const exportCad =
  process.env.TF_HELIX_COMPARE_EXPORT_CAD === "1" ||
  process.env.TF_HELIX_COMPARE_EXPORT_CAD === "true";

async function renderVariant({ name, partDef, backend, outDir }) {
  console.log(`Running variant: ${name}`);
  const t0 = performance.now();
  const result = buildPart(partDef, backend);
  const t1 = performance.now();
  const body = result.final.outputs.get("body:main");
  if (!body) {
    throw new Error(`${name}: missing body:main`);
  }
  const mesh = backend.mesh(body, {
    linearDeflection: 0.2,
    angularDeflection: 0.2,
    parallel: true,
  });
  const t2 = performance.now();
  const png = renderIsometricPng(mesh, {
    width: 1400,
    height: 1000,
    baseColor: [165, 178, 196],
    wireframe: false,
    wireColor: [26, 33, 44],
    background: [247, 248, 251],
    backgroundAlpha: 1,
  });
  const t3 = performance.now();
  const stl = exportCad
    ? backend.exportStl?.(body, {
        format: "binary",
        linearDeflection: 0.2,
        angularDeflection: 0.2,
      })
    : null;
  const step = exportCad
    ? backend.exportStep(body, { schema: "AP242", unit: "mm" })
    : null;
  const t4 = performance.now();

  const base = path.join(outDir, name);
  await fs.writeFile(`${base}.png`, png);
  if (step) await fs.writeFile(`${base}.step`, Buffer.from(step));
  if (stl) await fs.writeFile(`${base}.stl`, Buffer.from(stl));

  return {
    name,
    files: {
      png: `${base}.png`,
      step: step ? `${base}.step` : null,
      stl: stl ? `${base}.stl` : null,
    },
    stats: {
      outputs: Array.from(result.final.outputs.keys()),
      positions: mesh.positions.length,
      triangles: Math.floor(
        (mesh.indices?.length ?? mesh.positions.length) / 3
      ),
      timingsMs: {
        build: Number((t1 - t0).toFixed(1)),
        mesh: Number((t2 - t1).toFixed(1)),
        renderPng: Number((t3 - t2).toFixed(1)),
        exportCad: Number((t4 - t3).toFixed(1)),
        total: Number((t4 - t0).toFixed(1)),
      },
    },
  };
}

const config = {
  radius: 11,
  pitch: 3.5,
  turns: 3.0,
  samplesPerTurn: 60,
  wireRadius: 0.55,
};

const outDir = process.env.TF_HELIX_COMPARE_OUT ?? "temp/experiments/helix-compare";
await fs.mkdir(outDir, { recursive: true });

const points = helixPoints(config);
const splinePathD3 = pathSpline(points, { degree: 3 });
const splinePathD2 = pathSpline(points, { degree: 2 });
const splinePathD1 = pathSpline(points, { degree: 1 });
const polylinePath = pathPolyline(points);
const segmentPath = pathSegments(lineSegments(points));

const initStart = performance.now();
const occt = await initOpenCascade();
const backend = new OcctBackend({ occt });
const initDone = performance.now();

const variants = [];
variants.push(
  await renderVariant({
    name: "helix-spline-d3-default",
    partDef: makePart({
      id: "helix-spline-d3-default",
      path: splinePathD3,
    }),
    backend,
    outDir,
  })
);
variants.push(
  await renderVariant({
    name: "helix-spline-d2-default",
    partDef: makePart({
      id: "helix-spline-d2-default",
      path: splinePathD2,
    }),
    backend,
    outDir,
  })
);
variants.push(
  await renderVariant({
    name: "helix-spline-d1-default",
    partDef: makePart({
      id: "helix-spline-d1-default",
      path: splinePathD1,
    }),
    backend,
    outDir,
  })
);
variants.push(
  await renderVariant({
    name: "helix-polyline-default",
    partDef: makePart({
      id: "helix-polyline-default",
      path: polylinePath,
    }),
    backend,
    outDir,
  })
);
variants.push(
  await renderVariant({
    name: "helix-polyline-frenet",
    partDef: makePart({
      id: "helix-polyline-frenet",
      path: polylinePath,
      sweepOpts: { orientation: "frenet" },
    }),
    backend,
    outDir,
  })
);
variants.push(
  await renderVariant({
    name: "helix-segments-default",
    partDef: makePart({
      id: "helix-segments-default",
      path: segmentPath,
    }),
    backend,
    outDir,
  })
);

const summary = {
  outDir,
  config,
  pathPointRadiusStats: radiusStats(points),
  initOcctMs: Number((initDone - initStart).toFixed(1)),
  variants,
};

await fs.writeFile(
  path.join(outDir, "helix-compare.meta.json"),
  JSON.stringify(summary, null, 2)
);

console.log(JSON.stringify(summary, null, 2));
