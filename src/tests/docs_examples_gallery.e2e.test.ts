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
        /id="image-preview-modal"/,
        "gallery should include the image preview modal container"
      );
      assert.match(
        html,
        /activateCode\(targetId\)/,
        "gallery should wire title clicks to code activation"
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
