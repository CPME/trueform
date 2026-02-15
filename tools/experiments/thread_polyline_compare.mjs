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
  pathPolyline,
  planeDatum,
  profileRef,
  profileSketchLoop,
  sketch2d,
  sketchLine,
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

function makeThreadRidgePart({
  id,
  points,
  config,
  xAxisHint,
  sweepOpts,
}) {
  const start = points[0];
  if (!start) throw new Error("helix path missing start point");
  const tangent = [0, config.radius, config.pitch / (2 * Math.PI)];

  return part(id, [
    datumPlane(
      "thread-plane",
      axisVector(tangent),
      start,
      undefined,
      xAxisHint ? { xAxis: axisVector(xAxisHint) } : undefined
    ),
    sketch2d(
      "thread-profile",
      [
        {
          name: "profile:thread",
          profile: profileSketchLoop(["edge-a", "edge-b", "edge-c"]),
        },
      ],
      {
        plane: planeDatum("thread-plane"),
        origin: start,
        entities: [
          sketchLine("edge-a", [0, -config.crestWidth / 2], [config.depth, 0]),
          sketchLine("edge-b", [config.depth, 0], [0, config.rootWidth / 2]),
          sketchLine("edge-c", [0, config.rootWidth / 2], [0, -config.crestWidth / 2]),
        ],
      }
    ),
    sweep(
      "thread-ridge",
      profileRef("profile:thread"),
      pathPolyline(points),
      "body:main",
      undefined,
      sweepOpts
    ),
  ]);
}

async function renderVariant({ variant, points, config, backend, outDir, exportCad }) {
  console.log(`Running variant: ${variant.name}`);
  const partDef = makeThreadRidgePart({
    id: `thread-polyline-${variant.name}`,
    points,
    config,
    xAxisHint: variant.xAxisHint,
    sweepOpts: variant.sweepOpts,
  });

  const t0 = performance.now();
  const result = buildPart(partDef, backend);
  const t1 = performance.now();
  const body = result.final.outputs.get("body:main");
  if (!body) {
    throw new Error(
      `variant ${variant.name}: missing body:main. outputs=${Array.from(result.final.outputs.keys()).join(", ")}`
    );
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
    baseColor: [164, 176, 192],
    wireframe: true,
    wireColor: [22, 28, 36],
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
  const step = exportCad ? backend.exportStep(body, { schema: "AP242", unit: "mm" }) : null;
  const t4 = performance.now();

  const base = path.join(outDir, variant.name);
  await fs.writeFile(`${base}.png`, png);
  if (stl) await fs.writeFile(`${base}.stl`, Buffer.from(stl));
  if (step) await fs.writeFile(`${base}.step`, Buffer.from(step));

  return {
    name: variant.name,
    xAxisHint: variant.xAxisHint ?? null,
    sweepOpts: variant.sweepOpts ?? {},
    files: {
      png: `${base}.png`,
      stl: stl ? `${base}.stl` : null,
      step: step ? `${base}.step` : null,
    },
    stats: {
      outputs: Array.from(result.final.outputs.keys()),
      positions: mesh.positions.length,
      triangles: Math.floor((mesh.indices?.length ?? mesh.positions.length) / 3),
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
  turns: 2.5,
  samplesPerTurn: 64,
  depth: 1.0,
  crestWidth: 0.8,
  rootWidth: 1.4,
};

const outDir =
  process.env.TF_THREAD_POLY_OUT ?? "temp/experiments/thread-polyline-compare";
const exportCad =
  process.env.TF_THREAD_POLY_EXPORT_CAD === "1" ||
  process.env.TF_THREAD_POLY_EXPORT_CAD === "true";

await fs.mkdir(outDir, { recursive: true });

const points = helixPoints(config);
const variants = [
  {
    name: "thread-polyline-default",
    xAxisHint: [1, 0, 0],
    sweepOpts: undefined,
  },
  {
    name: "thread-polyline-frenet",
    xAxisHint: [1, 0, 0],
    sweepOpts: { orientation: "frenet" },
  },
  {
    name: "thread-polyline-fixed-frame-radial",
    xAxisHint: [1, 0, 0],
    sweepOpts: { frame: planeDatum("thread-plane") },
  },
  {
    name: "thread-polyline-fixed-frame-up",
    xAxisHint: [0, 0, 1],
    sweepOpts: { frame: planeDatum("thread-plane") },
  },
];

const initStart = performance.now();
const occt = await initOpenCascade();
const backend = new OcctBackend({ occt });
const initDone = performance.now();

const results = [];
for (const variant of variants) {
  results.push(
    await renderVariant({
      variant,
      points,
      config,
      backend,
      outDir,
      exportCad,
    })
  );
}

const summary = {
  outDir,
  config,
  pathPointRadiusStats: radiusStats(points),
  initOcctMs: Number((initDone - initStart).toFixed(1)),
  variants: results,
};

await fs.writeFile(
  path.join(outDir, "thread-polyline-compare.meta.json"),
  JSON.stringify(summary, null, 2)
);

console.log(JSON.stringify(summary, null, 2));
