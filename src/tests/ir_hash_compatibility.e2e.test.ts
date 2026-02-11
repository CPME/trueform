import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { strFromU8, unzipSync } from "fflate";

import { compilePartWithHashes } from "../compiler.js";
import { dsl } from "../dsl.js";
import { TF_DOCUMENT_SCHEMA, createTfContainer, readTfContainer } from "../tf/container.js";
import { hashValue, stableStringify } from "../hash.js";
import { runTests } from "./occt_test_utils.js";

type CompatFixture = {
  schema: "trueform.compat.ir-hash.v1";
  hashValueCases: Array<{
    id: string;
    expectedString: string;
    expectedHash: string;
  }>;
  compilePartWithHashes: {
    expectedOrder: string[];
    expectedFeatureHashes: Record<string, string>;
  };
  container: {
    createdAt: string;
    expectedDocumentHash: string;
    expectedDocumentJson: string;
  };
};

const fixturesPath = resolve("tools/fixtures/compat/ir-hash-compat.v1.json");
const fixtureRaw = await readFile(fixturesPath, "utf8");
const fixture = JSON.parse(fixtureRaw) as CompatFixture;

function buildCompatPart() {
  return dsl.part("compat-part", [
    dsl.sketch2d("sketch-base", [
      { name: "profile:base", profile: dsl.profileRect(20, 10) },
    ]),
    dsl.extrude(
      "base-extrude",
      dsl.profileRef("profile:base"),
      6,
      "body:main",
      ["sketch-base"]
    ),
    dsl.sketch2d(
      "sketch-top",
      [{ name: "profile:top", profile: dsl.profileRect(8, 4, [0, 0, 6]) }],
      { deps: ["base-extrude"] }
    ),
    dsl.extrude(
      "top-extrude",
      dsl.profileRef("profile:top"),
      4,
      "body:top",
      ["sketch-top", "base-extrude"]
    ),
  ]);
}

const tests = [
  {
    name: "compat: hash canonicalization fixtures remain stable",
    fn: async () => {
      const cases = new Map(
        fixture.hashValueCases.map((entry) => [entry.id, entry])
      );

      const caseObject = cases.get("stable-object-order");
      assert.ok(caseObject);
      const objectInput = { b: 2, a: 1, c: { z: 9, y: [3, 2, 1] } };
      assert.equal(stableStringify(objectInput), caseObject!.expectedString);
      assert.equal(hashValue(objectInput), caseObject!.expectedHash);

      const caseArray = cases.get("stable-array-of-objects");
      assert.ok(caseArray);
      const arrayInput = [{ k: 2, j: 1 }, { b: true, a: false }];
      assert.equal(stableStringify(arrayInput), caseArray!.expectedString);
      assert.equal(hashValue(arrayInput), caseArray!.expectedHash);
    },
  },
  {
    name: "compat: compilePartWithHashes fixtures remain stable",
    fn: async () => {
      const compiled = compilePartWithHashes(buildCompatPart());
      assert.deepEqual(compiled.order, fixture.compilePartWithHashes.expectedOrder);
      assert.deepEqual(
        Object.fromEntries(compiled.hashes),
        fixture.compilePartWithHashes.expectedFeatureHashes
      );
    },
  },
  {
    name: "compat: container canonical document json/hash fixtures remain stable",
    fn: async () => {
      const document = dsl.document("compat-doc", [buildCompatPart()], dsl.context());
      const bytes = await createTfContainer(document, [], {
        createdAt: fixture.container.createdAt,
      });

      const files = unzipSync(bytes);
      const documentJson = strFromU8(files["document.json"] as Uint8Array);
      assert.equal(documentJson, fixture.container.expectedDocumentJson);

      const parsed = await readTfContainer(bytes);
      assert.equal(parsed.manifest.document.hash, fixture.container.expectedDocumentHash);
      assert.equal(parsed.manifest.document.schema, TF_DOCUMENT_SCHEMA);
      assert.equal(parsed.document.schema, TF_DOCUMENT_SCHEMA);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
