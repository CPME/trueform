import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initOpenCascade from "opencascade.js/dist/node.js";
import { buildPart, OcctBackend } from "../../dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "assets");
const outPath = path.join(outDir, "plate.stl");

const part = {
  id: "plate",
  features: [
    {
      id: "base-extrude",
      kind: "feature.extrude",
      profile: { kind: "profile.rectangle", width: 80, height: 40 },
      depth: 8,
      result: "body:main",
    },
  ],
};

try {
  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });
  const result = buildPart(part, backend);
  const body = result.final.outputs.get("body:main");
  if (!body) {
    throw new Error("Missing body:main output");
  }

  const shape = body.meta["shape"];
  if (!shape) {
    throw new Error("Missing OCCT shape metadata");
  }

  await fs.mkdir(outDir, { recursive: true });

  const meshArgs = [
    [shape, 0.5],
    [shape, 0.5, false, 0.5, true],
    [shape, 0.25, false, 0.25, true],
  ];
  for (const args of meshArgs) {
    try {
      const mesh = newOcct(occt, "BRepMesh_IncrementalMesh", ...args);
      if (typeof mesh.Perform === "function") mesh.Perform();
      break;
    } catch {
      continue;
    }
  }

  const writer = newOcct(occt, "StlAPI_Writer");
  const tmpPath = "/tmp/trueform_plate.stl";
  const progress = newOcct(occt, "Message_ProgressRange");
  const wrote =
    typeof writer.Write === "function"
      ? writer.Write(shape, tmpPath, progress)
      : typeof writer.Write_2 === "function"
        ? writer.Write_2(shape, tmpPath, progress)
        : null;

  if (wrote === false) {
    throw new Error("STL writer returned false");
  }

  if (occt.FS && typeof occt.FS.readFile === "function") {
    const data = occt.FS.readFile(tmpPath, { encoding: "binary" });
    await fs.writeFile(outPath, data);
    console.log(JSON.stringify({ output: outPath, bytes: data.length }, null, 2));
  } else {
    throw new Error("OCCT FS not available for STL export");
  }
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Export failed:", error.message);
  if (error.stack) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
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
  throw new Error(`OCCT constructor not found: ${name}`);
}
