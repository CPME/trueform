import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizePart } from "../../dist/compiler.js";
import { buildSketchSvg } from "../../dist/sketch/svg.js";
import { sketchFeatureExamples } from "../../dist/examples/sketch_feature_examples.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "docs", "public", "examples", "sketch");
const shouldSkip =
  process.env.TF_DOCS_SKIP_EXAMPLES === "1" ||
  process.env.TF_DOCS_SKIP_EXAMPLES === "true";

const theme = {
  background: null,
  stroke: "#e6f1ff",
  constructionStroke: "#9fb0d1",
  pointStroke: "#e6f1ff",
  pointFill: "#e6f1ff",
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function verifyExistingExamples() {
  const missing = [];
  const manifestPath = path.join(outDir, "manifest.json");
  let manifestIds = new Set();

  if (await fileExists(manifestPath)) {
    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (Array.isArray(manifest.examples)) {
        for (const entry of manifest.examples) {
          if (entry && typeof entry.id === "string") {
            manifestIds.add(entry.id);
          }
        }
      }
    } catch {
      missing.push(`Invalid manifest.json: ${manifestPath}`);
    }
  } else {
    missing.push(`Missing manifest.json: ${manifestPath}`);
  }

  for (const example of sketchFeatureExamples) {
    const svgPath = path.join(outDir, `${example.id}.svg`);
    if (!(await fileExists(svgPath))) {
      missing.push(`Missing SVG: ${svgPath}`);
    }
    if (!manifestIds.has(example.id)) {
      missing.push(`Missing manifest entry for ${example.id}`);
    }
  }

  if (missing.length > 0) {
    const sample = missing.slice(0, 8).join("\n  - ");
    throw new Error(
      `Sketch examples are missing assets. Run npm run docs:examples and commit outputs.\n  - ${sample}`
    );
  }

  console.log(
    JSON.stringify(
      {
        outputDir: outDir,
        count: sketchFeatureExamples.length,
        mode: "skip",
      },
      null,
      2
    )
  );
}

try {
  if (shouldSkip) {
    await verifyExistingExamples();
    process.exit(0);
  }

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
