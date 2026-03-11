import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import type { Backend } from "../backend.js";
import { buildPart } from "../executor.js";
import { CompileError } from "../errors.js";
import { resolveSelector } from "../selectors.js";
import { kernelResultToResolutionContext } from "../resolution_context.js";
import type { TestCase } from "./occt_test_utils.js";

export type SelectorConformanceTarget = {
  name: string;
  backend: Backend;
  expectSelectionAliases?: boolean;
};

export function selectorConformanceTests(
  target: SelectorConformanceTarget
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
        const result = buildPart(part, target.backend);
        const selector = dsl.selectorFace([dsl.predNormal("+Z")]);
        const face = resolveSelector(selector, kernelResultToResolutionContext(result.final));
        assert.equal(face.kind, "face");
        assert.equal(face.meta["normal"], "+Z");
      },
    },
    {
      name: `${target.name}: selector resolves by createdBy + rank`,
      fn: async () => {
        const result = buildPart(part, target.backend);
        const selector = dsl.selectorFace(
          [dsl.predCreatedBy("base-extrude")],
          [dsl.rankMaxZ()]
        );
        const face = resolveSelector(selector, kernelResultToResolutionContext(result.final));
        assert.equal(face.kind, "face");
        assert.equal(face.meta["createdBy"], "base-extrude");
      },
    },
    {
      name: `${target.name}: selector resolves named output`,
      fn: async () => {
        const result = buildPart(part, target.backend);
        const selector = dsl.selectorNamed("body:main");
        const selection = resolveSelector(selector, kernelResultToResolutionContext(result.final));
        assert.equal(selection.kind, "solid");
      },
    },
    {
      name: `${target.name}: selector resolves explicit stable selection id`,
      fn: async () => {
        const result = buildPart(part, target.backend);
        const topFace = result.final.selections.find(
          (selection) =>
            selection.kind === "face" &&
            selection.meta["createdBy"] === "base-extrude" &&
            selection.meta["normal"] === "+Z"
        );
        assert.ok(topFace, "missing stable top face selection");
        const selector = dsl.selectorNamed(String(topFace?.id ?? ""));
        const selection = resolveSelector(selector, kernelResultToResolutionContext(result.final));
        assert.equal(selection.id, topFace?.id);
      },
    },
    {
      name: `${target.name}: selector resolves stable selection alias`,
      fn: async () => {
        if (!target.expectSelectionAliases) return;
        const result = buildPart(part, target.backend);
        const topFace = result.final.selections.find(
          (selection) =>
            selection.kind === "face" &&
            selection.meta["createdBy"] === "base-extrude" &&
            selection.meta["normal"] === "+Z"
        );
        assert.ok(topFace, "missing stable top face selection");
        const aliases = Array.isArray(topFace?.meta["selectionAliases"])
          ? (topFace?.meta["selectionAliases"] as string[])
          : [];
        assert.ok(aliases.length > 0, "missing stable selection alias");
        const selector = dsl.selectorNamed(String(aliases[0] ?? ""));
        const selection = resolveSelector(selector, kernelResultToResolutionContext(result.final));
        assert.equal(selection.id, topFace?.id);
      },
    },
    {
      name: `${target.name}: selector rejects legacy numeric selection ids`,
      fn: async () => {
        const result = buildPart(part, target.backend);
        assert.throws(
          () =>
            resolveSelector(
              dsl.selectorNamed("face:1"),
              kernelResultToResolutionContext(result.final)
            ),
          (err) =>
            err instanceof CompileError &&
            err.code === "selector_legacy_numeric_unsupported" &&
            err.details?.["referenceId"] === "face:1"
        );
      },
    },
  ];
}
