import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { buildPart } from "../../dist/executor.js";
import { buildAssembly, dsl } from "../../dist/index.js";
import { renderIsometricPngLayers } from "../../dist/viewer/isometric_renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "assets", "sweeps", "slider-mate");
const framesDir = path.join(outDir, "frames");
const gifPath = path.join(outDir, "slider-mate.gif");
const palettePath = path.join(outDir, "palette.png");

const frames = Math.max(2, Number(process.env.TF_SWEEP_FRAMES ?? 36));
const xMin = Number(process.env.TF_SWEEP_X_MIN ?? 0);
const xMax = Number(process.env.TF_SWEEP_X_MAX ?? 8);
const fps = Math.max(1, Number(process.env.TF_SWEEP_FPS ?? 24));
const seedOffset = Number(process.env.TF_SWEEP_SEED_OFFSET ?? 6);
const seedRotation = Number(process.env.TF_SWEEP_SEED_ROTATION ?? 12);

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOutSine(t) {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

function transformPositions(positions, matrix) {
  const out = new Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    out[i] = (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0);
    out[i + 1] =
      (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0);
    out[i + 2] =
      (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0);
  }
  return out;
}

function transformNormals(normals, matrix) {
  const out = new Array(normals.length);
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i] ?? 0;
    const y = normals[i + 1] ?? 0;
    const z = normals[i + 2] ?? 0;
    const nx = (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z;
    const ny = (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z;
    const nz = (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    out[i] = nx / len;
    out[i + 1] = ny / len;
    out[i + 2] = nz / len;
  }
  return out;
}

function transformMesh(mesh, matrix) {
  const positions = transformPositions(mesh.positions, matrix);
  const normals = Array.isArray(mesh.normals) ? transformNormals(mesh.normals, matrix) : undefined;
  const edgePositions = Array.isArray(mesh.edgePositions)
    ? transformPositions(mesh.edgePositions, matrix)
    : undefined;
  return {
    ...mesh,
    positions,
    normals,
    edgePositions,
  };
}

function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

try {
  await fs.mkdir(framesDir, { recursive: true });

  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });

  const baseWidth = 60;
  const baseDepth = 24;
  const baseHeight = 6;
  const slotLength = 40;
  const slotWidth = 8;
  const slotDepth = 2;

  const sliderLength = 30;
  const sliderDepth = 20;
  const sliderHeight = 4;
  const keyLength = 32;
  const keyWidth = 6;
  const keyDepth = slotDepth;

  const basePart = dsl.part(
    "slider-base",
    [
      dsl.extrude("base", dsl.profileRect(baseWidth, baseDepth), baseHeight, "body:base"),
      dsl.extrude(
        "slot-tool",
        dsl.profileRect(slotLength, slotWidth, [0, 0, baseHeight]),
        -slotDepth,
        "body:slot-tool"
      ),
      dsl.booleanOp(
        "slot-cut",
        "subtract",
        dsl.selectorNamed("body:base"),
        dsl.selectorNamed("body:slot-tool"),
        "body:main",
        ["base", "slot-tool"]
      ),
    ],
    {
      connectors: [
        dsl.mateConnector(
          "base-face",
          dsl.selectorFace(
            [dsl.predPlanar(), dsl.predCreatedBy("base")],
            [dsl.rankMaxZ()]
          ),
          { normal: "+X", xAxis: "+Z" }
        ),
      ],
    }
  );

  const sliderPart = dsl.part(
    "slider-carriage",
    [
      dsl.extrude(
        "slider-body",
        dsl.profileRect(sliderLength, sliderDepth, [0, 0, baseHeight]),
        sliderHeight,
        "body:body"
      ),
      dsl.extrude(
        "slider-key",
        dsl.profileRect(keyLength, keyWidth, [0, 0, baseHeight]),
        -keyDepth,
        "body:key"
      ),
      dsl.booleanOp(
        "slider-union",
        "union",
        dsl.selectorNamed("body:body"),
        dsl.selectorNamed("body:key"),
        "body:main",
        ["slider-body", "slider-key"]
      ),
    ],
    {
      connectors: [
        dsl.mateConnector(
          "slider-face",
          dsl.selectorFace(
            [dsl.predPlanar(), dsl.predCreatedBy("slider-body")],
            [dsl.rankMinZ()]
          ),
          { normal: "+X", xAxis: "+Z" }
        ),
      ],
    }
  );

  const builtBase = buildPart(basePart, backend);
  const builtSlider = buildPart(sliderPart, backend);

  const baseBody = builtBase.final.outputs.get("body:main");
  if (!baseBody) {
    throw new Error("Missing body:main output for slider base");
  }
  const sliderBody = builtSlider.final.outputs.get("body:main");
  if (!sliderBody) {
    throw new Error("Missing body:main output for slider carriage");
  }

  const baseMesh = backend.mesh(baseBody, {
    linearDeflection: 0.45,
    angularDeflection: 0.45,
    parallel: true,
  });
  const sliderMesh = backend.mesh(sliderBody, {
    linearDeflection: 0.45,
    angularDeflection: 0.45,
    parallel: true,
  });

  const meta = [];
  const forward = Array.from({ length: frames }, (_, idx) => idx);
  const backward = Array.from({ length: Math.max(0, frames - 2) }, (_, idx) =>
    frames - 2 - idx
  );
  const frameOrder = forward.concat(backward);

  for (let i = 0; i < frameOrder.length; i += 1) {
    const frameIdx = frameOrder[i] ?? 0;
    const t = frames === 1 ? 0 : frameIdx / (frames - 1);
    const eased = easeInOutSine(t);
    const x = lerp(xMin, xMax, eased);
    const seedTransform = dsl.transform({
      translation: [x, seedOffset, -seedOffset * 0.4],
      rotation: [0, 0, seedRotation],
    });

    const assembly = dsl.assembly(
      `slider-mate-${i}`,
      [
        dsl.assemblyInstance("base", basePart.id),
        dsl.assemblyInstance("slider", sliderPart.id, seedTransform),
      ],
      {
        mates: [
          dsl.mateSlider(
            dsl.assemblyRef("base", "base-face"),
            dsl.assemblyRef("slider", "slider-face")
          ),
          dsl.mateDistance(
            dsl.assemblyRef("base", "base-face"),
            dsl.assemblyRef("slider", "slider-face"),
            x
          ),
        ],
      }
    );

    const solved = buildAssembly(assembly, [builtBase, builtSlider]);
    if (!solved.converged) {
      throw new Error(`Solve failed at frame ${i} (residual ${solved.residual})`);
    }
    const baseInst = solved.instances.find((inst) => inst.id === "base");
    const sliderInst = solved.instances.find((inst) => inst.id === "slider");
    if (!baseInst || !sliderInst) {
      throw new Error(`Missing instance transforms at frame ${i}`);
    }

    const dx = sliderInst.transform[12] ?? 0;
    const dy = sliderInst.transform[13] ?? 0;
    const dz = sliderInst.transform[14] ?? 0;
    const orthoDrift = Math.hypot(dy, dz);
    const seedDelta = Math.abs(dx - x);
    if (orthoDrift > 1e-3) {
      throw new Error(`Slider constraint drift at frame ${i} (yz ${orthoDrift})`);
    }
    if (seedDelta > 1e-2) {
      throw new Error(`Slider seed drift at frame ${i} (dx ${seedDelta})`);
    }

    const layers = [
      {
        mesh: transformMesh(baseMesh, baseInst.transform),
        baseColor: [86, 132, 178],
        wireColor: [34, 44, 60],
      },
      {
        mesh: transformMesh(sliderMesh, sliderInst.transform),
        baseColor: [210, 162, 112],
        wireColor: [34, 44, 60],
      },
    ];

    const png = renderIsometricPngLayers(layers, {
      width: 1200,
      height: 900,
      background: [244, 245, 248],
      backgroundAlpha: 1,
      viewDir: [1.2, 0.8, -0.65],
      ambient: 0.45,
      diffuse: 0.75,
      wireframe: true,
      wireDepthTest: true,
    });

    const frameName = `frame_${String(i).padStart(3, "0")}.png`;
    await fs.writeFile(path.join(framesDir, frameName), png);
    meta.push({
      frame: i,
      xSeed: x,
      t,
      eased,
      translation: [dx, dy, dz],
      residual: solved.residual,
      iterations: solved.iterations,
    });
  }

  await fs.writeFile(path.join(outDir, "metadata.json"), JSON.stringify(meta, null, 2));

  const pattern = path.join(framesDir, "frame_%03d.png");
  await runCommand("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    pattern,
    "-vf",
    "palettegen=stats_mode=diff",
    palettePath,
  ]);
  await runCommand("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    pattern,
    "-i",
    palettePath,
    "-lavfi",
    "paletteuse=dither=sierra2_4a",
    "-loop",
    "0",
    gifPath,
  ]);

  console.log(JSON.stringify({ framesDir, gif: gifPath, frames, fps }, null, 2));
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Slider sweep failed:", error.message);
  if (error.stack) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
}
