import { mkdir, writeFile } from "node:fs/promises";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/aklR3sAAAAASUVORK5CYII=";

const { dsl } = await import("../../dist/index.js");
const { createTfContainer } = await import("../../dist/tf/container.js");

const part = dsl.part("plate", [
  dsl.sketch2d("sketch-base", [
    {
      name: "profile:base",
      profile: dsl.profileRect(100, 60),
    },
  ]),
  dsl.extrude(
    "base-extrude",
    dsl.profileRef("profile:base"),
    dsl.exprLiteral(6, "mm"),
    "body:main",
    ["sketch-base"]
  ),
]);

const document = dsl.document("doc-1", [part], dsl.context());

const previewBytes = Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64");
const meshJson = JSON.stringify({
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  indices: [0, 1, 2],
});

const bytes = await createTfContainer(
  document,
  [
    {
      type: "thumbnail",
      path: "artifacts/preview.png",
      data: previewBytes,
    },
    {
      type: "mesh",
      path: "artifacts/part.mesh.json",
      data: meshJson,
      build: {
        kernel: { name: "ocjs", version: "0.0.0-test" },
        tolerance: { linear: 1e-6, angular: 1e-6 },
      },
    },
  ],
  { createdAt: "2026-02-07T00:00:00Z" }
);

const outDir = new URL("./examples/", import.meta.url);
await mkdir(outDir, { recursive: true });
await writeFile(new URL("./examples/minimal.tfc", import.meta.url), bytes);
