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
  pathSpline,
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
  const count = Math.max(12, Math.ceil(turns * samplesPerTurn));
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

const config = {
  radius: 11,
  pitch: 3.5,
  turns: 2.5,
  depth: 1.0,
  crestWidth: 0.8,
  rootWidth: 1.4,
  samplesPerTurn: 48,
};

const outDir =
  process.env.TF_THREAD_EXPERIMENT_OUT ?? "/tmp/trueform-thread-from-sweep";

const points = helixPoints(config);
const start = points[0];
if (!start) {
  throw new Error("failed to build helix path");
}

const tangent = [
  0,
  config.radius,
  config.pitch / (2 * Math.PI),
];

const threadPart = part("thread-from-sweep", [
  datumPlane("thread-plane", axisVector(tangent), start),
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
        sketchLine(
          "edge-a",
          [0, -config.crestWidth / 2],
          [config.depth, 0]
        ),
        sketchLine(
          "edge-b",
          [config.depth, 0],
          [0, config.rootWidth / 2]
        ),
        sketchLine(
          "edge-c",
          [0, config.rootWidth / 2],
          [0, -config.crestWidth / 2]
        ),
      ],
    }
  ),
  sweep(
    "thread-ridge",
    profileRef("profile:thread"),
    pathSpline(points, { degree: 3 }),
    "body:main",
    undefined,
    { orientation: "frenet" }
  ),
]);

await fs.mkdir(outDir, { recursive: true });

const t0 = performance.now();
const occt = await initOpenCascade();
const backend = new OcctBackend({ occt });
const t1 = performance.now();
const result = buildPart(threadPart, backend);
const t2 = performance.now();
const body = result.final.outputs.get("body:main");
if (!body) {
  throw new Error(
    `missing body:main. outputs: ${Array.from(result.final.outputs.keys()).join(", ")}`
  );
}

const mesh = backend.mesh(body, {
  linearDeflection: 0.3,
  angularDeflection: 0.3,
  parallel: true,
});
const t3 = performance.now();
const png = renderIsometricPng(mesh, {
  width: 1400,
  height: 1000,
  baseColor: [166, 178, 192],
  wireColor: [24, 30, 38],
  background: [248, 249, 251],
  backgroundAlpha: 1,
});
const t4 = performance.now();

const stl = backend.exportStl?.(body, {
  format: "binary",
  linearDeflection: 0.3,
  angularDeflection: 0.3,
});
const step = backend.exportStep(body, { schema: "AP242", unit: "mm" });
const t5 = performance.now();

const pngPath = path.join(outDir, "thread-from-sweep.png");
const stlPath = path.join(outDir, "thread-from-sweep.stl");
const stepPath = path.join(outDir, "thread-from-sweep.step");
const metaPath = path.join(outDir, "thread-from-sweep.meta.json");

await fs.writeFile(pngPath, png);
if (stl) await fs.writeFile(stlPath, Buffer.from(stl));
await fs.writeFile(stepPath, Buffer.from(step));

const summary = {
  outDir,
  files: {
    png: pngPath,
    stl: stl ? stlPath : null,
    step: stepPath,
  },
  config,
  stats: {
    outputs: Array.from(result.final.outputs.keys()),
    positions: mesh.positions.length,
    triangles: Math.floor(
      (mesh.indices?.length ?? mesh.positions.length) / 3
    ),
    timingsMs: {
      initOcct: Number((t1 - t0).toFixed(1)),
      build: Number((t2 - t1).toFixed(1)),
      mesh: Number((t3 - t2).toFixed(1)),
      renderPng: Number((t4 - t3).toFixed(1)),
      exportCad: Number((t5 - t4).toFixed(1)),
      total: Number((t5 - t0).toFixed(1)),
    },
  },
};

await fs.writeFile(metaPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
