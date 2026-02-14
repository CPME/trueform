import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { compileDocument, compilePart, normalizePart } from "../compiler.js";
import { TF_IR_SCHEMA, TF_IR_VERSION } from "../ir.js";
import type { IntentDocument } from "../ir.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "validation: invalid axis throws",
    fn: async () => {
      const badHole = {
        ...dsl.hole(
          "hole-1",
          dsl.selectorFace([dsl.predPlanar()]),
          "+Z",
          5,
          "throughAll"
        ),
        axis: "UP" as unknown as "+Z",
      };
      const part = dsl.part("plate", [badHole]);
      assert.throws(() => normalizePart(part), /axis/i);
    },
  },
  {
    name: "validation: empty feature id throws",
    fn: async () => {
      const badExtrude = {
        ...dsl.extrude("base", dsl.profileRect(2, 3), 5),
        id: "",
      };
      const part = dsl.part("plate", [badExtrude]);
      assert.throws(() => normalizePart(part), /Feature id/);
    },
  },
  {
    name: "validation: assembly instance missing part throws",
    fn: async () => {
      const part = dsl.part("part-a", []);
      const instance = dsl.assemblyInstance("inst-1", "missing-part");
      const assembly = dsl.assembly("asm-1", [instance]);
      const doc = dsl.document("doc-1", [part], dsl.context(), [assembly]);
      assert.throws(() => compileDocument(doc), /missing part/);
    },
  },
  {
    name: "validation: can be disabled",
    fn: async () => {
      const badHole = {
        ...dsl.hole(
          "hole-1",
          dsl.selectorFace([dsl.predPlanar()]),
          "+Z",
          5,
          "throughAll"
        ),
        axis: "UP" as unknown as "+Z",
      };
      const part = dsl.part("plate", [badHole]);
      assert.doesNotThrow(() => normalizePart(part, undefined, { validate: "none" }));
    },
  },
  {
    name: "validation: staged features can be blocked",
    fn: async () => {
      const part = dsl.part("staged-thread", [
        dsl.thread("thread-1", "+Z", 10, 8, 1.5, "body:main"),
      ]);
      assert.throws(
        () => normalizePart(part, undefined, { stagedFeatures: "error" }),
        /staging feature/i
      );
    },
  },
  {
    name: "validation: staged features can warn without blocking",
    fn: async () => {
      const part = dsl.part("staged-surface", [
        dsl.extrude(
          "surface-extrude",
          dsl.profileCircle(4),
          10,
          "surface:main",
          undefined,
          { mode: "surface" }
        ),
      ]);

      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (message?: unknown) => warnings.push(String(message ?? ""));
      try {
        assert.doesNotThrow(() =>
          normalizePart(part, undefined, { stagedFeatures: "warn" })
        );
      } finally {
        console.warn = originalWarn;
      }
      assert.ok(
        warnings.some((message) => message.includes("staging feature")),
        "Expected staging warning to be emitted"
      );
    },
  },
  {
    name: "validation: stable features pass when staged policy is error",
    fn: async () => {
      const part = dsl.part("stable-only", [
        dsl.extrude("base", dsl.profileRect(2, 3), 5),
      ]);
      assert.doesNotThrow(() =>
        normalizePart(part, undefined, { stagedFeatures: "error" })
      );
    },
  },
  {
    name: "validation: unknown staged feature policy is rejected",
    fn: async () => {
      const part = dsl.part("stable-only", [
        dsl.extrude("base", dsl.profileRect(2, 3), 5),
      ]);
      assert.throws(
        () =>
          normalizePart(part, undefined, {
            stagedFeatures: "blocker" as "error",
          }),
        /Unsupported stagedFeatures policy/
      );
    },
  },
  {
    name: "validation: compilePart accepts IR part directly",
    fn: async () => {
      const part = {
        id: "direct-ir-part",
        features: [],
      };
      const compiled = compilePart(part);
      assert.equal(compiled.partId, "direct-ir-part");
      assert.deepEqual(compiled.featureOrder, []);
    },
  },
  {
    name: "validation: compileDocument accepts IR document directly",
    fn: async () => {
      const document: IntentDocument = {
        id: "direct-ir-doc",
        schema: TF_IR_SCHEMA,
        irVersion: TF_IR_VERSION,
        parts: [{ id: "part-a", features: [] }],
        context: dsl.context(),
      };
      const compiled = compileDocument(document);
      assert.equal(compiled.length, 1);
      assert.equal(compiled[0]?.partId, "part-a");
    },
  },
  {
    name: "validation: invalid schema is rejected",
    fn: async () => {
      const baseDocument: IntentDocument = {
        id: "bad-schema-doc",
        schema: TF_IR_SCHEMA,
        irVersion: TF_IR_VERSION,
        parts: [{ id: "part-a", features: [] }],
        context: dsl.context(),
      };
      const document = {
        ...baseDocument,
        schema: "trueform.ir.v0",
      } as unknown as IntentDocument;
      assert.throws(() => compileDocument(document), /Unsupported IR schema/);
    },
  },
  {
    name: "validation: invalid IR version is rejected",
    fn: async () => {
      const baseDocument: IntentDocument = {
        id: "bad-version-doc",
        schema: TF_IR_SCHEMA,
        irVersion: TF_IR_VERSION,
        parts: [{ id: "part-a", features: [] }],
        context: dsl.context(),
      };
      const document = {
        ...baseDocument,
        irVersion: 999,
      } as unknown as IntentDocument;
      assert.throws(() => compileDocument(document), /Unsupported IR version/);
    },
  },
  {
    name: "validation: DSL-authored compile flow still works",
    fn: async () => {
      const part = dsl.part("plate", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(2, 3) },
        ]),
        dsl.extrude(
          "base-extrude",
          dsl.profileRef("profile:base"),
          5,
          "body:main",
          ["sketch-base"]
        ),
      ]);
      const doc = dsl.document("doc-1", [part], dsl.context());
      const compiled = compileDocument(doc);
      assert.deepEqual(compiled[0]?.featureOrder, ["sketch-base", "base-extrude"]);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
