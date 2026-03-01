import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  renderIsometricPng,
  renderIsometricPngLayers,
} from "../viewer/isometric_renderer.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "viewer isometric: renders shaded png from mesh",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("iso-plate", [
        dsl.extrude("base", dsl.profileRect(60, 40), 8, "body:main"),
      ]);
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const mesh = backend.mesh(body, {
        linearDeflection: 0.6,
        angularDeflection: 0.6,
        parallel: true,
      });
      const png = renderIsometricPng(mesh, { width: 720, height: 540 });
      assert.ok(png.length > 1024, "png output should be non-empty");
      assert.deepEqual(
        Array.from(png.subarray(0, 8)),
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "png signature should match"
      );

      const outDir = path.resolve("tools/viewer/assets");
      await fs.mkdir(outDir, { recursive: true });
      const outPath = path.join(outDir, "test_plate.iso.png");
      await fs.writeFile(outPath, png);
    },
  },
  {
    name: "viewer isometric: renders wire-only edge overlay layers",
    fn: async () => {
      const { backend } = await getBackendContext();
      const part = dsl.part("iso-edge-overlay", [
        dsl.extrude("base", dsl.profileRect(40, 30), 8, "body:main"),
      ]);
      const result = buildPart(part, backend);
      const body = result.final.outputs.get("body:main");
      assert.ok(body, "missing body:main output");

      const baseMesh = backend.mesh(body, {
        linearDeflection: 0.6,
        angularDeflection: 0.6,
        parallel: true,
      });
      const topEdge = result.final.selections
        .filter((selection) => selection.kind === "edge")
        .map((selection) => ({
          selection,
          centerZ:
            typeof selection.meta["centerZ"] === "number"
              ? (selection.meta["centerZ"] as number)
              : Number.NEGATIVE_INFINITY,
        }))
        .sort((a, b) => b.centerZ - a.centerZ)[0]?.selection;
      assert.ok(topEdge, "missing top edge selection");

      const edgeMesh = backend.mesh(
        {
          id: topEdge.id,
          kind: topEdge.kind,
          meta: topEdge.meta,
        },
        {
          linearDeflection: 0.6,
          angularDeflection: 0.6,
          parallel: true,
        }
      );
      assert.ok(
        (edgeMesh.edgePositions?.length ?? 0) > 0,
        "expected wire-only edge mesh positions"
      );
      assert.equal(edgeMesh.positions.length, 0, "edge overlay should not require face positions");

      const png = renderIsometricPngLayers([
        { mesh: baseMesh },
        {
          mesh: edgeMesh,
          baseAlpha: 0,
          wireframe: true,
          wireColor: [249, 115, 22],
          wireDepthTest: false,
          depthTest: false,
        },
      ], { width: 720, height: 540 });
      assert.ok(png.length > 1024, "png output should be non-empty");
      assert.deepEqual(
        Array.from(png.subarray(0, 8)),
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        "png signature should match"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
