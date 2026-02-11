import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import type { Backend, KernelResult } from "../backend.js";
import { buildPart } from "../executor.js";
import type { TestCase } from "./occt_test_utils.js";

export type BackendConformanceTarget = {
  name: string;
  backend: Backend;
};

export function backendConformanceTests(
  target: BackendConformanceTarget
): TestCase[] {
  return [
    {
      name: `${target.name}: execute returns KernelResult shape`,
      fn: async () => {
        const empty: KernelResult = { outputs: new Map(), selections: [] };
        const result = target.backend.execute({
          feature: dsl.datumPlane("datum-1", "+Z"),
          upstream: empty,
          resolve: () => {
            throw new Error("resolve should not be called for datum features");
          },
        });
        assert.ok(result.outputs instanceof Map);
        assert.ok(Array.isArray(result.selections));
      },
    },
    {
      name: `${target.name}: buildPart produces a named solid`,
      fn: async () => {
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
        const result = buildPart(part, target.backend);
        const body = result.final.outputs.get("body:main");
        assert.ok(body, "expected body:main output");
      },
    },
    {
      name: `${target.name}: mesh/export are callable`,
      fn: async () => {
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
        const result = buildPart(part, target.backend);
        const body = result.final.outputs.get("body:main");
        assert.ok(body, "expected body:main output");
        const mesh = target.backend.mesh(body);
        assert.ok(Array.isArray(mesh.positions));
        const step = target.backend.exportStep(body);
        assert.ok(step instanceof Uint8Array);
        if (target.backend.exportStl) {
          const stl = target.backend.exportStl(body);
          assert.ok(stl instanceof Uint8Array);
        }
      },
    },
  ];
}
