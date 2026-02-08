import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { buildPart } from "../../dist/executor.js";
import { buildPmiPayload } from "../../dist/pmi.js";
import { renderIsometricPng } from "../../dist/viewer/isometric_renderer.js";
import { dslFeatureExamples } from "../../dist/examples/dsl_feature_examples.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "docs", "public", "examples", "dsl");
const pmiDir = path.join(__dirname, "..", "..", "docs", "public", "examples", "pmi");

const meshOpts = {
  linearDeflection: 0.2,
  angularDeflection: 0.2,
  parallel: true,
};

try {
  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(pmiDir, { recursive: true });

  const manifest = [];

  for (const example of dslFeatureExamples) {
    const result = buildPart(example.part, backend);
    const body = result.final.outputs.get("body:main");
    if (!body) {
      throw new Error(`Example ${example.id} missing body:main output`);
    }
    const mesh = backend.mesh(body, meshOpts);
    const png = renderIsometricPng(mesh, { width: 1200, height: 900 });
    const filename = `${example.id}.iso.png`;
    await fs.writeFile(path.join(outDir, filename), png);
    manifest.push({
      id: example.id,
      title: example.title,
      image: `/examples/dsl/${filename}`,
    });

    if (example.part.constraints && example.part.constraints.length > 0) {
      const payload = buildPmiPayload(example.part);
      const pmiPath = path.join(pmiDir, `${example.id}.pmi.json`);
      await fs.writeFile(pmiPath, JSON.stringify(payload, null, 2));
    }
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
  console.error("Doc example rendering failed:", error.message);
  if (error.stack) console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}
