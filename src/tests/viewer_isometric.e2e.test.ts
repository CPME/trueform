import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import {
  renderIsometricPng,
  renderIsometricPngLayers,
} from "../viewer/isometric_renderer.js";
import { getBackendContext, runTests } from "./occt_test_utils.js";
import type { MeshData } from "../backend.js";

function makeQuadMesh(z: number): MeshData {
  return {
    positions: [
      -1, -1, z,
       1, -1, z,
       1,  1, z,
      -1,  1, z,
    ],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

function readPngPixel(png: Buffer, x: number, y: number): [number, number, number, number] {
  const signature = png.subarray(0, 8);
  assert.deepEqual(
    Array.from(signature),
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "png signature should match"
  );

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatParts: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    offset += 4;
    const type = png.subarray(offset, offset + 4).toString("ascii");
    offset += 4;
    const data = png.subarray(offset, offset + length);
    offset += length + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  assert.ok(width > 0 && height > 0, "png should define dimensions");
  assert.ok(x >= 0 && x < width && y >= 0 && y < height, "pixel lookup should be in bounds");

  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const stride = width * 4 + 1;
  const rowStart = y * stride;
  assert.equal(raw[rowStart], 0, "test PNG rows should be unfiltered");
  const pixelStart = rowStart + 1 + x * 4;
  return [
    raw[pixelStart] ?? 0,
    raw[pixelStart + 1] ?? 0,
    raw[pixelStart + 2] ?? 0,
    raw[pixelStart + 3] ?? 0,
  ];
}

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
  {
    name: "viewer isometric: transparent layers tint opaque geometry only when they are in front",
    fn: async () => {
      const png = renderIsometricPngLayers(
        [
          {
            mesh: makeQuadMesh(0),
            baseColor: [0, 220, 0],
            baseAlpha: 1,
            wireframe: false,
            depthTest: true,
          },
          {
            mesh: makeQuadMesh(1),
            baseColor: [0, 0, 255],
            baseAlpha: 0.45,
            wireframe: false,
            depthTest: true,
          },
          {
            mesh: makeQuadMesh(-1),
            baseColor: [255, 0, 0],
            baseAlpha: 0.45,
            wireframe: false,
            depthTest: true,
          },
        ],
        {
          width: 120,
          height: 120,
          padding: 12,
          viewDir: [0, 0, -1],
          lightDir: [0, 0, -1],
          ambient: 1,
          diffuse: 0,
          background: [255, 255, 255],
          backgroundAlpha: 1,
        }
      );
      const [r, g, b, a] = readPngPixel(png, 60, 60);
      assert.ok(a > 0, "center pixel should be covered");
      assert.ok(b > 80, "front transparent layer should tint the opaque base");
      assert.ok(g > b, "opaque base should remain visible through the front transparent layer");
      assert.ok(r < 24, "behind transparent layer should not leak through the opaque base");
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
