import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePart } from "../../dist/compiler.js";
import { sketchPrimitivesPart } from "../../dist/examples/sketch_primitives.js";
import { buildSketchSvg } from "../../dist/sketch/svg.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "assets");
const outPath = path.join(outDir, "sketch_primitives.svg");

const part = sketchPrimitivesPart;
const normalized = normalizePart(part);
const sketch = normalized.features.find((f) => f.kind === "feature.sketch2d");

if (!sketch) {
  throw new Error("Sketch export: no sketch2d feature found");
}

const entities = sketch.entities ?? [];
const svg = buildSketchSvg(entities);
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outPath, svg);
console.log(JSON.stringify({ output: outPath, entities: entities.length }, null, 2));
