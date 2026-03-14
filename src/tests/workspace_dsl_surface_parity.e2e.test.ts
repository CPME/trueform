import assert from "node:assert/strict";
import * as rootDslModule from "../dsl.js";
import * as rootGeometryModule from "../dsl/geometry.js";
import { runTests } from "./occt_test_utils.js";

const dslModuleId = "@trueform/dsl";
const dslGeometryModuleId = "@trueform/dsl/geometry";

const workspaceDsl = (await import(dslModuleId)) as Record<string, unknown>;
const workspaceGeometry = (await import(dslGeometryModuleId)) as Record<string, unknown>;

const REQUIRED_DSL_EXPORTS = [
  "dsl",
  "part",
  "document",
  "paramLength",
  "assembly",
  "extrude",
  "selectorNamed",
  "sketchConstraintCoincident",
];

const REQUIRED_GEOMETRY_EXPORTS = [
  "extrude",
  "profileRect",
  "selectorFace",
  "selectorNamed",
  "sketchConstraintCoincident",
  "sketchRectCenter",
];

const tests = [
  {
    name: "workspace dsl parity: required exports exist in root and package entrypoint",
    fn: async () => {
      for (const key of REQUIRED_DSL_EXPORTS) {
        assert.equal(Object.prototype.hasOwnProperty.call(workspaceDsl, key), true, `@trueform/dsl missing export ${key}`);
        assert.equal(Object.prototype.hasOwnProperty.call(rootDslModule, key), true, `root dsl missing export ${key}`);
      }
      for (const key of REQUIRED_GEOMETRY_EXPORTS) {
        assert.equal(Object.prototype.hasOwnProperty.call(workspaceGeometry, key), true, `@trueform/dsl/geometry missing export ${key}`);
        assert.equal(Object.prototype.hasOwnProperty.call(rootGeometryModule, key), true, `root geometry missing export ${key}`);
      }
    },
  },
  {
    name: "workspace dsl parity: root and package exports map to same implementation",
    fn: async () => {
      for (const key of REQUIRED_DSL_EXPORTS) {
        assert.equal(workspaceDsl[key], (rootDslModule as Record<string, unknown>)[key], `mismatched dsl export identity for ${key}`);
      }
      for (const key of REQUIRED_GEOMETRY_EXPORTS) {
        assert.equal(workspaceGeometry[key], (rootGeometryModule as Record<string, unknown>)[key], `mismatched geometry export identity for ${key}`);
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
