import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import type { BackendAsync, KernelResult, KernelSelection } from "../backend.js";
import { buildPartAsync } from "../executor.js";
import { resolveSelector } from "../selectors.js";
import type { TestCase } from "./occt_test_utils.js";

export type SelectorConformanceAsyncTarget = {
  name: string;
  backend: BackendAsync;
};

export function selectorConformanceTestsAsync(
  target: SelectorConformanceAsyncTarget
): TestCase[] {
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

  return [
    {
      name: `${target.name}: selector resolves by normal`,
      fn: async () => {
        const result = await buildPartAsync(part, target.backend);
        const selector = dsl.selectorFace([dsl.predNormal("+Z")]);
        const face = resolveSelector(selector, toResolutionContext(result.final));
        assert.equal(face.kind, "face");
        assert.equal(face.meta["normal"], "+Z");
      },
    },
    {
      name: `${target.name}: selector resolves by createdBy + rank`,
      fn: async () => {
        const result = await buildPartAsync(part, target.backend);
        const selector = dsl.selectorFace(
          [dsl.predCreatedBy("base-extrude")],
          [dsl.rankMaxZ()]
        );
        const face = resolveSelector(selector, toResolutionContext(result.final));
        assert.equal(face.kind, "face");
        assert.equal(face.meta["createdBy"], "base-extrude");
      },
    },
    {
      name: `${target.name}: selector resolves named output`,
      fn: async () => {
        const result = await buildPartAsync(part, target.backend);
        const selector = dsl.selectorNamed("body:main");
        const selection = resolveSelector(selector, toResolutionContext(result.final));
        assert.equal(selection.kind, "solid");
      },
    },
  ];
}

function toResolutionContext(upstream: KernelResult) {
  const named = new Map<string, KernelSelection>();
  for (const [key, obj] of upstream.outputs) {
    if (
      obj.kind === "face" ||
      obj.kind === "edge" ||
      obj.kind === "solid" ||
      obj.kind === "surface"
    ) {
      named.set(key, { id: obj.id, kind: obj.kind, meta: obj.meta });
    }
  }
  return { selections: upstream.selections, named };
}
