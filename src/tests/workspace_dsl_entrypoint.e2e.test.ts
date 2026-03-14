import assert from "node:assert/strict";
import * as rootDslModule from "../dsl.js";
import * as rootGeometryModule from "../dsl/geometry.js";
import { runTests } from "./occt_test_utils.js";

const dslModuleId = "@trueform/dsl";
const dslGeometryModuleId = "@trueform/dsl/geometry";

const workspaceDsl = (await import(dslModuleId)) as Record<string, unknown>;
const workspaceGeometry = (await import(dslGeometryModuleId)) as Record<string, unknown>;

const tests = [
  {
    name: "workspace dsl: @trueform/dsl exposes stable aggregate DSL contracts",
    fn: async () => {
      assert.equal(typeof workspaceDsl.dsl, "object");
      assert.equal(typeof workspaceDsl.part, "function");
      assert.equal(typeof workspaceDsl.document, "function");
      assert.equal(typeof workspaceDsl.extrude, "function");
      assert.equal(typeof workspaceDsl.selectorFace, "function");
      assert.equal(typeof workspaceDsl.sketchConstraintCoincident, "function");
    },
  },
  {
    name: "workspace dsl: @trueform/dsl/geometry exposes stable geometry builders",
    fn: async () => {
      assert.equal(typeof workspaceGeometry.extrude, "function");
      assert.equal(typeof workspaceGeometry.selectorFace, "function");
      assert.equal(typeof workspaceGeometry.sketchConstraintCoincident, "function");
      assert.equal(typeof workspaceGeometry.profileRect, "function");
    },
  },
  {
    name: "workspace dsl: package entrypoints stay source-compatible with root surfaces",
    fn: async () => {
      assert.equal(workspaceDsl.dsl, (rootDslModule as Record<string, unknown>).dsl);
      assert.equal(workspaceDsl.part, (rootDslModule as Record<string, unknown>).part);
      assert.equal(workspaceDsl.document, (rootDslModule as Record<string, unknown>).document);
      assert.equal(
        workspaceGeometry.sketchConstraintCoincident,
        (rootGeometryModule as Record<string, unknown>).sketchConstraintCoincident
      );
      assert.equal(
        workspaceGeometry.selectorFace,
        (rootGeometryModule as Record<string, unknown>).selectorFace
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
