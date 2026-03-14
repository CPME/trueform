import assert from "node:assert/strict";
import * as rootExportApi from "../export/index.js";
import { runTests } from "./occt_test_utils.js";

const exportModuleId = "@trueform/export";
const workspaceExportApi = (await import(exportModuleId)) as Record<string, unknown>;

const REQUIRED_EXPORTS = [
  "exportGlb",
  "export3mf",
  "exportStepAp242WithPmi",
  "exportStepAp242WithPmiAsync",
  "buildSketchSvg",
  "buildSketchDxf",
];

const tests = [
  {
    name: "workspace export parity: required exports exist in root and package entrypoint",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(Object.prototype.hasOwnProperty.call(workspaceExportApi, key), true, `@trueform/export missing export ${key}`);
        assert.equal(Object.prototype.hasOwnProperty.call(rootExportApi, key), true, `root export missing export ${key}`);
      }
    },
  },
  {
    name: "workspace export parity: root and package exports map to same implementation",
    fn: async () => {
      for (const key of REQUIRED_EXPORTS) {
        assert.equal(workspaceExportApi[key], (rootExportApi as Record<string, unknown>)[key], `mismatched export identity for ${key}`);
      }
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
