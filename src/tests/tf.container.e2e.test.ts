import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import {
  TF_CONTAINER_SCHEMA,
  TF_DOCUMENT_SCHEMA,
  createTfContainer,
  readTfContainer,
} from "../tf/container.js";
import { runTests } from "./occt_test_utils.js";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/aklR3sAAAAASUVORK5CYII=";

const tests = [
  {
    name: "tf: container round-trip preserves document + artifacts",
    fn: async () => {
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

      const result = await readTfContainer(bytes);
      assert.equal(result.manifest.schema, TF_CONTAINER_SCHEMA);
      assert.equal(result.manifest.document.schema, TF_DOCUMENT_SCHEMA);
      assert.equal(result.manifest.document.path, "document.json");
      assert.equal(result.document.id, document.id);
      assert.deepEqual(result.document, document);

      const previewRoundTrip = result.artifacts.get("artifacts/preview.png");
      assert.ok(previewRoundTrip);
      assert.equal(
        Buffer.compare(Buffer.from(previewRoundTrip), previewBytes),
        0
      );

      const meshRoundTrip = result.artifacts.get("artifacts/part.mesh.json");
      assert.ok(meshRoundTrip);
      assert.equal(Buffer.from(meshRoundTrip).toString("utf8"), meshJson);

    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
