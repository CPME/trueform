import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initOpenCascade from "opencascade.js/dist/node.js";
import { OcctBackend } from "../../dist/backend_occt.js";
import { buildPart } from "../../dist/executor.js";
import { partRegistry } from "../../dist/examples/parts/registry.js";
import { paramSweeps } from "../../dist/examples/param_sweeps.js";
import { renderIsometricPng } from "../../dist/viewer/isometric_renderer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "assets", "sweeps");

function formatValue(value) {
  if (typeof value === "number") {
    const cleaned = value.toString().replace(/\./g, "p");
    return cleaned;
  }
  return String(value).replace(/[^\w.-]+/g, "_");
}

function formatOverrides(overrides) {
  return Object.entries(overrides)
    .map(([key, value]) => `${key}${formatValue(value)}`)
    .join("_");
}

try {
  const registry = new Map(partRegistry.map((entry) => [entry.id, entry]));
  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });

  await fs.mkdir(outDir, { recursive: true });

  for (const sweep of paramSweeps) {
    const partEntry = registry.get(sweep.partId);
    if (!partEntry) {
      throw new Error(`Param sweep ${sweep.id} references missing part ${sweep.partId}`);
    }

    const sweepDir = path.join(outDir, sweep.id);
    await fs.mkdir(sweepDir, { recursive: true });

    const variants = [];
    let index = 1;
    for (const overrides of sweep.overrides) {
      const tag = formatOverrides(overrides) || `variant-${index}`;
      const basename = `${sweep.partId}-${tag}`;
      const meshPath = path.join(sweepDir, `${basename}.mesh.json`);
      const isoPath = path.join(sweepDir, `${basename}.iso.png`);

      const result = buildPart(partEntry.part, backend, overrides);
      const body = result.final.outputs.get("body:main");
      if (!body) {
        throw new Error(`Missing body:main output for ${sweep.partId}`);
      }

      const mesh = backend.mesh(body, {
        linearDeflection: 0.5,
        angularDeflection: 0.5,
        parallel: true,
      });

      await fs.writeFile(meshPath, JSON.stringify(mesh));
      const isoPng = renderIsometricPng(mesh, { width: 1200, height: 900 });
      await fs.writeFile(isoPath, isoPng);

      variants.push({
        id: tag,
        mesh: meshPath,
        iso: isoPath,
        overrides,
      });
      index += 1;
    }

    await fs.writeFile(
      path.join(sweepDir, "manifest.json"),
      JSON.stringify(
        {
          sweep: sweep.id,
          title: sweep.title,
          partId: sweep.partId,
          variants,
        },
        null,
        2
      )
    );
  }
} catch (err) {
  const error = err instanceof Error ? err : new Error(String(err));
  console.error("Sweep failed:", error.message);
  if (error.stack) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
}
