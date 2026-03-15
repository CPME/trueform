import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { runTests } from "./occt_test_utils.js";

const galleryPath = path.resolve("docs/public/examples/index.html");

const tests = [
  {
    name: "docs examples gallery: cards expose separate image preview and code navigation hooks",
    fn: async () => {
      const html = await fs.readFile(galleryPath, "utf8");
      assert.match(
        html,
        /class="card-image-button"[\s\S]*data-preview-src="/,
        "gallery cards should include image preview buttons"
      );
      assert.match(
        html,
        /class="card-title-link"[^>]*data-code-target="code-dsl-boolean-intersect"/,
        "gallery cards should include title links that target code entries"
      );
      assert.match(
        html,
        /data-preview-src="\.\/dsl\/selection-ledger-extrude-review\.annotated\.svg"/,
        "selection-ledger review cards should prefer annotated previews when available"
      );
      assert.match(
        html,
        /data-preview-src="\.\/dsl\/selection-ledger-revolve-review\.annotated\.svg"/,
        "selection-ledger revolve review should also prefer annotated previews"
      );
      assert.match(
        html,
        /id="image-preview-modal"/,
        "gallery should include the image preview modal container"
      );
      assert.match(
        html,
        /activateCode\(targetId\)/,
        "gallery should wire title clicks to code activation"
      );
      assert.match(
        html,
        /<h2 class="section-title">Sketch 2D<\/h2>/,
        "gallery should group sketch examples into the unified workflow sections"
      );
      assert.match(
        html,
        /<h2 class="section-title">Boolean &amp; Combine<\/h2>/,
        "gallery should expose boolean examples as their own workflow section"
      );
      assert.doesNotMatch(
        html,
        /<h2 class="section-title">DSL Examples<\/h2>/,
        "gallery should no longer split the app into separate DSL and sketch top-level sections"
      );
      assert.doesNotMatch(
        html,
        /<h2 class="section-title">Sketch Examples<\/h2>/,
        "gallery should no longer keep sketch examples in a separate top-level section"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
