import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePart } from "../../dist/compiler.js";
import { buildSketchSvg } from "../../dist/sketch/svg.js";
import { sketchFeatureExamples } from "../../dist/examples/sketch_feature_examples.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "docs", "public", "examples", "sketch");

const theme = {
  background: null,
  stroke: "#e6f1ff",
  constructionStroke: "#9fb0d1",
  pointStroke: "#e6f1ff",
  pointFill: "#e6f1ff",
};

try {
  await fs.mkdir(outDir, { recursive: true });
  const manifest = [];

  for (const example of sketchFeatureExamples) {
    const normalized = normalizePart(example.part);
    const sketch = normalized.features.find((f) => f.kind === "feature.sketch2d");
    if (!sketch) {
      throw new Error(`Sketch example ${example.id} missing sketch2d feature`);
    }
    const svg = buildSketchSvg(sketch.entities ?? [], { theme });
    const filename = `${example.id}.svg`;
    await fs.writeFile(path.join(outDir, filename), svg);
    manifest.push({
      id: example.id,
      title: example.title,
      image: `/examples/sketch/${filename}`,
    });
  }

  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ examples: manifest }, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        outputDir: outDir,
        count: manifest.length,
      },
      null,
      2
    )
  );
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Sketch example rendering failed:", error.message);
  if (error.stack) console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}
