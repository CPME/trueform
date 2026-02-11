import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import type {
  Backend,
  ExecuteInput,
  KernelObject,
  KernelResult,
  MeshData,
} from "../backend.js";
import { buildPart } from "../executor.js";
import { BackendError } from "../errors.js";
import { runTests } from "./occt_test_utils.js";

class LimitedBackend implements Backend {
  capabilities() {
    return {
      name: "limited",
      featureKinds: ["feature.sketch2d"],
      mesh: false,
      exports: { step: false, stl: false },
    };
  }

  execute(input: ExecuteInput): KernelResult {
    if (input.feature.kind === "feature.sketch2d") {
      return { outputs: new Map(), selections: [] };
    }
    throw new Error("execute should not be called for unsupported features");
  }

  mesh(_target: KernelObject): MeshData {
    return { positions: [] };
  }

  exportStep(_target: KernelObject): Uint8Array {
    return new Uint8Array();
  }
}

const tests = [
  {
    name: "backend capabilities: unsupported feature throws BackendError",
    fn: async () => {
      const backend = new LimitedBackend();
      const part = dsl.part("plate", [
        dsl.sketch2d("sketch-base", [
          { name: "profile:base", profile: dsl.profileRect(10, 5) },
        ]),
        dsl.extrude(
          "base-extrude",
          dsl.profileRef("profile:base"),
          2,
          "body:main",
          ["sketch-base"]
        ),
      ]);
      assert.throws(
        () => buildPart(part, backend),
        (err) =>
          err instanceof BackendError &&
          err.code === "backend_unsupported_feature" &&
          err.message.includes("feature.extrude")
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
