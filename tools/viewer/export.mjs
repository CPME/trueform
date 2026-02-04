import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { buildPart } from "../../dist/executor.js";
import { viewerPart } from "../../dist/examples/viewer_part.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "assets");
const outPath = path.join(outDir, "plate.mesh.json");

const part = viewerPart;

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
  console.log(
    JSON.stringify(
      { output: outPath, vertices: mesh.positions.length / 3 },
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
