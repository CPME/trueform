import assert from "node:assert/strict";
import * as rootExportApi from "../export/index.js";
import { runTests } from "./occt_test_utils.js";

const exportModuleId = "@trueform/export";
const workspaceExportApi = (await import(exportModuleId)) as Record<string, unknown>;

const tests = [
  {
    name: "workspace export: @trueform/export exposes stable export contracts",
    fn: async () => {
      assert.equal(typeof workspaceExportApi.exportGlb, "function");
      assert.equal(typeof workspaceExportApi.export3mf, "function");
      assert.equal(typeof workspaceExportApi.exportStepAp242WithPmi, "function");
      assert.equal(typeof workspaceExportApi.buildSketchSvg, "function");
      assert.equal(typeof workspaceExportApi.buildSketchDxf, "function");
    },
  },
  {
    name: "workspace export: package entrypoint stays source-compatible with root export surface",
    fn: async () => {
      assert.equal(workspaceExportApi.exportGlb, (rootExportApi as Record<string, unknown>).exportGlb);
      assert.equal(workspaceExportApi.export3mf, (rootExportApi as Record<string, unknown>).export3mf);
      assert.equal(
        workspaceExportApi.exportStepAp242WithPmi,
        (rootExportApi as Record<string, unknown>).exportStepAp242WithPmi
      );
      assert.equal(
        workspaceExportApi.buildSketchSvg,
        (rootExportApi as Record<string, unknown>).buildSketchSvg
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
