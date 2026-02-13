import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { renderIsometricPng } from "../../dist/viewer/isometric_renderer.js";

const config = {
  radius: 11,
  pitch: 8,
  turns: 4,
  samplesPerTurn: 128,
  depth: 2.6,
  baseWidth: 2.2,
  crestWidth: 0.8,
  rootWidth: 1.4,
};

const outDir = process.env.TF_THREAD_UV_OUT ?? "temp/experiments/thread-uv-compare";
const exportCad =
  process.env.TF_THREAD_UV_EXPORT_CAD === "1" ||
  process.env.TF_THREAD_UV_EXPORT_CAD === "true";

function normalize(v) {
  const m = Math.hypot(v[0], v[1], v[2]);
  if (m <= 1e-12) return [0, 0, 0];
  return [v[0] / m, v[1] / m, v[2] / m];
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

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function localPoint(origin, xDir, yDir, u, v) {
  return add(origin, add(scale(xDir, u), scale(yDir, v)));
}

function tryCall(target, names, argsList) {
  let lastErr = null;
  for (const name of names) {
    const fn = target?.[name];
    if (typeof fn !== "function") continue;
    for (const args of argsList) {
      try {
        return fn.call(target, ...args);
      } catch (err) {
        lastErr = err;
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Failed call [${names.join(", ")}]: ${msg}`);
}

function tryCallOptional(target, names, argsList) {
  try {
    return tryCall(target, names, argsList);
  } catch {
    return null;
  }
}

function makeProgressRange(be) {
  try {
    return be.newOcct("Message_ProgressRange");
  } catch {
    return null;
  }
}

function tryNewOcct(be, name, argsList) {
  let lastErr = null;
  for (const args of argsList) {
    try {
      return be.newOcct(name, ...args);
    } catch (err) {
      lastErr = err;
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Failed constructing ${name}: ${msg}`);
}

function tryCtor(occt, names, argsList) {
  let lastErr = null;
  for (const name of names) {
    const Ctor = occt?.[name];
    if (!Ctor) continue;
    for (const args of argsList) {
      try {
        return new Ctor(...args);
      } catch (err) {
        lastErr = err;
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`Failed constructors [${names.join(", ")}]: ${msg}`);
}

function makeHelixWireUv(be, cfg) {
  const occt = be.occt;
  const origin = be.makePnt(0, 0, 0);
  const axis = be.makeDir(0, 0, 1);
  const xDir = be.makeDir(1, 0, 0);
  const ax3 = tryCtor(occt, ["gp_Ax3_3", "gp_Ax3_2", "gp_Ax3"], [
    [origin, axis, xDir],
    [origin, axis],
  ]);
  const cyl = tryCtor(
    occt,
    ["Geom_CylindricalSurface_1", "Geom_CylindricalSurface", "Geom_CylindricalSurface_2"],
    [[ax3, cfg.radius]]
  );

  const p0 = be.makePnt2d(0, 0);
  const uStep = Math.PI * 2;
  const vStep = cfg.pitch;
  const d2 = be.makeDir2d(uStep, vStep);
  const line2d = tryNewOcct(be, "Geom2d_Line", [
    [p0, d2],
    [be.newOcct("gp_Ax2d", p0, d2)],
  ]);
  const hLine2d = tryCtor(occt, ["Handle_Geom2d_Curve_2", "Handle_Geom2d_Curve"], [[line2d]]);
  const turns = cfg.turns;
  // Geom2d_Line is parameterized by distance along unit gp_Dir2d.
  // To reach requested UV displacement (uStep*turns, vStep*turns),
  // the trim range must be scaled by vector magnitude.
  const paramEnd = turns * Math.hypot(uStep, vStep);
  const helix2d = tryCtor(occt, ["Geom2d_TrimmedCurve"], [
    [hLine2d, 0, paramEnd],
    [hLine2d, 0, paramEnd, true],
    [hLine2d, 0, paramEnd, true, true],
  ]);

  const h2d = tryCtor(occt, ["Handle_Geom2d_Curve_2", "Handle_Geom2d_Curve"], [[helix2d]]);
  const hs = tryCtor(occt, ["Handle_Geom_Surface_2", "Handle_Geom_Surface"], [[cyl]]);

  const edgeBuilder = tryCtor(occt, [
    "BRepBuilderAPI_MakeEdge_31",
    "BRepBuilderAPI_MakeEdge_30",
    "BRepBuilderAPI_MakeEdge",
  ], [
    [h2d, hs, 0, paramEnd],
    [h2d, hs],
  ]);
  const edgeShape = be.readShape(edgeBuilder);
  const edge =
    typeof be.toEdge === "function" ? be.toEdge(edgeShape) : edgeShape;
  // Ensure a 3D curve representation exists on the edge from its UV p-curve.
  if (occt?.BRepLib?.BuildCurve3d) {
    const continuity = occt.GeomAbs_Shape?.GeomAbs_C1 ?? 2;
    tryCall(occt.BRepLib, ["BuildCurve3d"], [[edge, 1e-6, continuity, 14, 16]]);
  }

  const wireBuilder = tryNewOcct(be, "BRepBuilderAPI_MakeWire", [[]]);
  if (!be.addWireEdge(wireBuilder, edge)) {
    throw new Error("Failed to add helix edge to wire");
  }
  const wire =
    typeof wireBuilder.Wire === "function"
      ? wireBuilder.Wire()
      : typeof wireBuilder.wire === "function"
        ? wireBuilder.wire()
        : be.readShape(wireBuilder);
  return wire;
}

function makeThreadProfileFace(be, cfg) {
  // Build an explicit start frame from helix geometry:
  // Z = start tangent, X = radial outward, Y = Z x X.
  const origin = [cfg.radius, 0, 0];
  const tangent = normalize([0, Math.PI * 2 * cfg.radius, cfg.pitch]);
  const xDir = normalize([1, 0, 0]);
  const yDir = normalize(cross(tangent, xDir));

  // Apex is at cylinder side; two equal flanks extend away from cylinder center.
  const halfBase = (cfg.baseWidth ?? Math.max(cfg.rootWidth, cfg.crestWidth)) / 2;
  const apex = localPoint(origin, xDir, yDir, 0, 0);
  const b1 = localPoint(origin, xDir, yDir, cfg.depth, -halfBase);
  const b2 = localPoint(origin, xDir, yDir, cfg.depth, halfBase);
  const wire = be.makePolygonWire([apex, b1, b2]);
  const face = be.readFace(be.makeFaceFromWire(wire));

  return {
    wire,
    face,
    frame: {
      origin,
      xDir,
      yDir,
      normal: tangent,
    },
  };
}

function makeHelixSplinePoints(cfg) {
  const turns = Math.max(0.01, cfg.turns);
  const count = Math.max(64, Math.ceil(turns * (cfg.samplesPerTurn ?? 160)));
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const a = Math.PI * 2 * turns * t;
    points.push([
      cfg.radius * Math.cos(a),
      cfg.radius * Math.sin(a),
      cfg.pitch * turns * t,
    ]);
  }
  return points;
}

function makeHelixWireSpline(be, cfg) {
  const points = makeHelixSplinePoints(cfg);
  const edge = be.makeSplineEdge3D({ kind: "path.spline", points }).edge;
  return be.makeWireFromEdges([edge]);
}

function makePipeShellFrenetC1(be, spine, profile) {
  const shell = be.newOcct("BRepOffsetAPI_MakePipeShell", spine);
  tryCall(shell, ["SetMode_1", "SetMode"], [[true]]);
  tryCallOptional(shell, ["SetForceApproxC1"], [[true]]);

  const mode = be.occt.BRepBuilderAPI_TransitionMode?.BRepBuilderAPI_RoundCorner;
  if (mode && typeof shell.SetTransitionMode === "function") {
    shell.SetTransitionMode(mode);
  }

  tryCall(shell, ["Add_1", "Add_2", "Add"], [
    [profile.face, false, false],
    [profile.face],
    [profile.wire, false, false],
    [profile.wire],
  ]);

  const isReady = typeof shell.IsReady === "function" ? shell.IsReady() : null;
  if (isReady === false) {
    throw new Error("pipe shell is not ready");
  }

  const progress = makeProgressRange(be);
  if (typeof shell.Build === "function") {
    try {
      shell.Build(progress);
    } catch {
      // ignore; some shells build lazily
    }
    try {
      shell.Build();
    } catch {
      // ignore; some bindings require only the progress overload
    }
  }
  tryCallOptional(shell, ["MakeSolid"], [[]]);
  const shape = be.readShape(shell);
  return { shape, isReady };
}

async function renderVariant(be, backend, spines, profileFace, variant) {
  const t0 = performance.now();
  let shape = null;
  let pipeReady = null;
  let spineSource = "uv";
  let uvError = null;
  try {
    const built = makePipeShellFrenetC1(be, spines.uv, profileFace);
    shape = built.shape;
    pipeReady = built.isReady;
  } catch (err) {
    uvError = err instanceof Error ? err.message : String(err);
    const built = makePipeShellFrenetC1(be, spines.spline, profileFace);
    shape = built.shape;
    pipeReady = built.isReady;
    spineSource = "spline-fallback";
  }

  const solid = be.normalizeSolid(shape);
  const t1 = performance.now();

  const target = {
    id: `${variant.name}:solid`,
    kind: "solid",
    meta: { shape: solid },
  };
  const mesh = backend.mesh(target, {
    linearDeflection: 0.12,
    angularDeflection: 0.12,
    parallel: true,
  });
  const t2 = performance.now();
  const flatMesh = { ...mesh, normals: undefined };
  const png = renderIsometricPng(flatMesh, {
    width: 1000,
    height: 1400,
    baseColor: [164, 176, 192],
    wireframe: true,
    wireColor: [20, 28, 36],
    background: [247, 248, 251],
    backgroundAlpha: 1,
    viewDir: [1, 0.25, 0],
    ambient: 0.2,
    diffuse: 0.8,
    lightDir: [0.5, 0.2, 0.7],
  });
  const profilePng = renderIsometricPng(flatMesh, {
    width: 1000,
    height: 1400,
    baseColor: [164, 176, 192],
    wireframe: true,
    wireColor: [20, 28, 36],
    background: [247, 248, 251],
    backgroundAlpha: 1,
    // Inspection view roughly along the start tangent, to expose the section shape.
    viewDir: [0.05, 1, 0.12],
    ambient: 0.2,
    diffuse: 0.8,
    lightDir: [0.5, 0.2, 0.7],
  });
  const t3 = performance.now();

  const stl = exportCad
    ? backend.exportStl?.(target, {
        format: "binary",
        linearDeflection: 0.2,
        angularDeflection: 0.2,
      })
    : null;
  const step = exportCad ? backend.exportStep(target, { schema: "AP242", unit: "mm" }) : null;
  const t4 = performance.now();

  const base = path.join(outDir, variant.name);
  await fs.writeFile(`${base}.png`, png);
  await fs.writeFile(`${base}-profile.png`, profilePng);
  if (stl) await fs.writeFile(`${base}.stl`, Buffer.from(stl));
  if (step) await fs.writeFile(`${base}.step`, Buffer.from(step));

  return {
    name: variant.name,
    opts: { frame: variant.frame, frenet: variant.frenet === true },
    spineSource,
    uvError,
    pipeReady,
    files: {
      png: `${base}.png`,
      profilePng: `${base}-profile.png`,
      stl: stl ? `${base}.stl` : null,
      step: step ? `${base}.step` : null,
    },
    stats: {
      positions: mesh.positions.length,
      triangles: Math.floor((mesh.indices?.length ?? mesh.positions.length) / 3),
      timingsMs: {
        sweep: Number((t1 - t0).toFixed(1)),
        mesh: Number((t2 - t1).toFixed(1)),
        render: Number((t3 - t2).toFixed(1)),
        exportCad: Number((t4 - t3).toFixed(1)),
        total: Number((t4 - t0).toFixed(1)),
      },
    },
  };
}

await fs.mkdir(outDir, { recursive: true });

const initStart = performance.now();
const occt = await initOpenCascade();
const backend = new OcctBackend({ occt });
const be = backend;
const initDone = performance.now();

const spineUv = makeHelixWireUv(be, config);
const spineSpline = makeHelixWireSpline(be, config);
const spines = { uv: spineUv, spline: spineSpline };
const profile = makeThreadProfileFace(be, config);

const variants = [{ name: "thread-uv-frenet-c1", frame: false, frenet: true }];

const results = [];
for (const variant of variants) {
  console.log(`Running variant: ${variant.name}`);
  try {
    results.push(await renderVariant(be, backend, spines, profile, variant));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Variant failed: ${variant.name}: ${message}`);
    results.push({
      name: variant.name,
      opts: { frame: variant.frame, frenet: variant.frenet === true },
      error: message,
    });
  }
}

const summary = {
  outDir,
  config,
  initOcctMs: Number((initDone - initStart).toFixed(1)),
  variants: results,
};

await fs.writeFile(
  path.join(outDir, "thread-uv-compare.meta.json"),
  JSON.stringify(summary, null, 2)
);

console.log(JSON.stringify(summary, null, 2));
