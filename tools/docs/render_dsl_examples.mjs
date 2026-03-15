import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OcctBackend } from "../../dist/backend_occt.js";
import { buildPart } from "../../dist/executor.js";
import { buildPmiPayload } from "../../dist/pmi.js";
import {
  renderIsometricPng,
  renderIsometricPngLayers,
} from "../../dist/viewer/isometric_renderer.js";
import {
  appendCosmeticThreadEdges,
  buildResolutionContext,
} from "../../dist/viewer/cosmetic_threads.js";
import { dslFeatureExamples } from "../../dist/examples/dsl_feature_examples.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "..", "docs", "public", "examples", "dsl");
const pmiDir = path.join(__dirname, "..", "..", "docs", "public", "examples", "pmi");
const shouldSkip =
  process.env.TF_DOCS_SKIP_EXAMPLES === "1" ||
  process.env.TF_DOCS_SKIP_EXAMPLES === "true";
const requestedExampleIds = new Set(
  String(process.env.TF_DOCS_ONLY ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
);

const meshOpts = {
  linearDeflection: 0.2,
  angularDeflection: 0.2,
  parallel: true,
};

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readExistingManifestEntries() {
  const manifestPath = path.join(outDir, "manifest.json");
  if (!(await fileExists(manifestPath))) {
    return [];
  }
  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    return Array.isArray(manifest.examples) ? manifest.examples : [];
  } catch {
    return [];
  }
}

function meshSelection(selection, backend, meshOpts) {
  return backend.mesh(
    {
      id: selection.id,
      kind: selection.kind,
      meta: selection.meta,
    },
    meshOpts
  );
}

function findSelectionById(result, selectionId) {
  const finalSelection = result.final.selections.find((entry) => entry.id === selectionId);
  if (finalSelection) return finalSelection;
  for (let i = result.steps.length - 1; i >= 0; i -= 1) {
    const stepSelection = result.steps[i]?.result?.selections?.find(
      (entry) => entry.id === selectionId
    );
    if (stepSelection) return stepSelection;
  }
  return null;
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

  for (const example of dslFeatureExamples) {
    const pngPath = path.join(outDir, `${example.id}.iso.png`);
    if (!(await fileExists(pngPath))) {
      missing.push(`Missing PNG: ${pngPath}`);
    }
    if (!manifestIds.has(example.id)) {
      missing.push(`Missing manifest entry for ${example.id}`);
    }
    const hasDatums = example.part.datums && example.part.datums.length > 0;
    const hasConstraints =
      example.part.constraints && example.part.constraints.length > 0;
    const hasCosmeticThreads =
      example.part.cosmeticThreads && example.part.cosmeticThreads.length > 0;
    if (hasDatums || hasConstraints || hasCosmeticThreads) {
      const pmiPath = path.join(pmiDir, `${example.id}.pmi.json`);
      if (!(await fileExists(pmiPath))) {
        missing.push(`Missing PMI JSON: ${pmiPath}`);
      }
    }
  }

  if (missing.length > 0) {
    const sample = missing.slice(0, 8).join("\n  - ");
    throw new Error(
      `Docs examples are missing assets. Run npm run docs:examples and commit outputs.\n  - ${sample}`
    );
  }

  console.log(
    JSON.stringify(
      {
        outputDir: outDir,
        count: dslFeatureExamples.length,
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

  const { default: initOpenCascade } = await import("opencascade.js/dist/node.js");
  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(pmiDir, { recursive: true });

  const examplesToRender =
    requestedExampleIds.size > 0
      ? dslFeatureExamples.filter((example) => requestedExampleIds.has(example.id))
      : dslFeatureExamples;
  const existingManifestEntries = await readExistingManifestEntries();
  const existingManifestById = new Map(
    existingManifestEntries
      .filter((entry) => entry && typeof entry.id === "string")
      .map((entry) => [entry.id, entry])
  );
  const renderedManifestById = new Map();
  for (const entry of existingManifestById.values()) {
    renderedManifestById.set(entry.id, entry);
  }

  for (const example of examplesToRender) {
    const result = buildPart(example.part, backend);
    const resolution = buildResolutionContext(result.final);
    const renderConfig = example.render ?? {};
    const mergedMeshOpts = { ...meshOpts, ...(renderConfig.meshOpts ?? {}) };
    let png;

    if (Array.isArray(renderConfig.layers) && renderConfig.layers.length > 0) {
      const layers = renderConfig.layers.map((layer) => {
        const output = result.final.outputs.get(layer.output);
        if (!output) {
          throw new Error(
            `Example ${example.id} missing output ${layer.output} for render layer`
          );
        }
        const mesh = backend.mesh(output, mergedMeshOpts);
        const meshWithThreads = appendCosmeticThreadEdges(
          mesh,
          example.part,
          resolution,
          occt
        );
        return {
          mesh: meshWithThreads,
          baseColor: layer.color,
          baseAlpha: layer.alpha,
          screenSpaceTint: layer.screenSpaceTint,
          wireframe: layer.wireframe,
          wireColor: layer.wireColor,
          wireDepthTest: layer.wireDepthTest,
          depthTest: layer.depthTest,
        };
      });
      for (const highlight of renderConfig.selectionHighlights ?? []) {
        const selection = findSelectionById(result, highlight.selectionId);
        if (!selection) {
          throw new Error(
            `Example ${example.id} missing selection ${highlight.selectionId} for render highlight`
          );
        }
        layers.push({
          mesh: meshSelection(selection, backend, mergedMeshOpts),
          baseColor: highlight.color,
          baseAlpha: highlight.alpha,
          wireframe: highlight.wireframe,
          wireColor: highlight.wireColor,
          wireDepthTest: highlight.wireDepthTest,
          depthTest: highlight.depthTest,
        });
      }
      png = renderIsometricPngLayers(layers, {
        width: 1200,
        height: 900,
        ...(renderConfig.renderOpts ?? {}),
      });
    } else {
      const body = result.final.outputs.get("body:main");
      if (!body) {
        throw new Error(`Example ${example.id} missing body:main output`);
      }
      const mesh = backend.mesh(body, mergedMeshOpts);
      const meshWithThreads = appendCosmeticThreadEdges(
        mesh,
        example.part,
        resolution,
        occt
      );
      const layers = [
        {
          mesh: meshWithThreads,
        },
      ];
      for (const highlight of renderConfig.selectionHighlights ?? []) {
        const selection = findSelectionById(result, highlight.selectionId);
        if (!selection) {
          throw new Error(
            `Example ${example.id} missing selection ${highlight.selectionId} for render highlight`
          );
        }
        layers.push({
          mesh: meshSelection(selection, backend, mergedMeshOpts),
          baseColor: highlight.color,
          baseAlpha: highlight.alpha,
          wireframe: highlight.wireframe,
          wireColor: highlight.wireColor,
          wireDepthTest: highlight.wireDepthTest,
          depthTest: highlight.depthTest,
        });
      }
      png =
        layers.length === 1
          ? renderIsometricPng(meshWithThreads, {
              width: 1200,
              height: 900,
              ...(renderConfig.renderOpts ?? {}),
            })
          : renderIsometricPngLayers(layers, {
              width: 1200,
              height: 900,
              ...(renderConfig.renderOpts ?? {}),
            });
    }
    const filename = `${example.id}.iso.png`;
    await fs.writeFile(path.join(outDir, filename), png);
    renderedManifestById.set(example.id, {
      id: example.id,
      title: example.title,
      image: `/examples/dsl/${filename}`,
    });

    const hasDatums = example.part.datums && example.part.datums.length > 0;
    const hasConstraints = example.part.constraints && example.part.constraints.length > 0;
    const hasCosmeticThreads =
      example.part.cosmeticThreads && example.part.cosmeticThreads.length > 0;
    if (hasDatums || hasConstraints || hasCosmeticThreads) {
      const payload = buildPmiPayload(example.part);
      const pmiPath = path.join(pmiDir, `${example.id}.pmi.json`);
      await fs.writeFile(pmiPath, JSON.stringify(payload, null, 2));
    }
  }

  const manifest = dslFeatureExamples
    .map((example) => renderedManifestById.get(example.id))
    .filter((entry) => entry !== undefined);

  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify({ examples: manifest }, null, 2)
  );

  console.log(
    JSON.stringify(
      {
        outputDir: outDir,
        count: examplesToRender.length,
        manifestCount: manifest.length,
        mode: requestedExampleIds.size > 0 ? "filtered" : "full",
        requested: requestedExampleIds.size > 0 ? Array.from(requestedExampleIds) : undefined,
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
