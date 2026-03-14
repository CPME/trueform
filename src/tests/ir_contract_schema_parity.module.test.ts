import assert from "node:assert/strict";
import {
  ANGLE_UNITS,
  AXIS_DIRECTIONS,
  DATUM_MODIFIERS,
  EXPR_BINARY_OPERATORS,
  EXTRUDE_MODES,
  EXTEND_SURFACE_MODES,
  HOLE_END_CONDITIONS,
  LENGTH_UNITS,
  PARAM_TYPES,
  POINT_LOCATORS,
  RIB_THICKNESS_SIDES,
  SWEEP_ORIENTATIONS,
  TF_IR_SCHEMA,
  TF_IR_VERSION,
  THICKEN_DIRECTIONS,
  THREAD_HANDEDNESS,
  TOLERANCE_MODIFIERS,
  TRIM_SURFACE_KEEPS,
  UNITS,
  UNWRAP_MODES,
} from "../ir_contract.js";
import { IR_SCHEMA } from "../ir_schema.js";
import { runTests } from "./occt_test_utils.js";

const ENUM_PARITY_CASES: Array<[string, readonly string[]]> = [
  ["LengthUnit", LENGTH_UNITS],
  ["AngleUnit", ANGLE_UNITS],
  ["Unit", UNITS],
  ["Units", LENGTH_UNITS],
  ["AxisDirection", AXIS_DIRECTIONS],
  ["ParamType", PARAM_TYPES],
  ["ExtrudeMode", EXTRUDE_MODES],
  ["RibThicknessSide", RIB_THICKNESS_SIDES],
  ["UnwrapMode", UNWRAP_MODES],
  ["SweepOrientation", SWEEP_ORIENTATIONS],
  ["ThickenDirection", THICKEN_DIRECTIONS],
  ["ThreadHandedness", THREAD_HANDEDNESS],
  ["HoleEndCondition", HOLE_END_CONDITIONS],
  ["PointLocator", POINT_LOCATORS],
  ["DatumModifier", DATUM_MODIFIERS],
  ["ToleranceModifier", TOLERANCE_MODIFIERS],
  ["ExtendSurfaceMode", EXTEND_SURFACE_MODES],
];

const tests = [
  {
    name: "ir contract parity: schema document identity matches canonical contract",
    fn: async () => {
      assert.equal(IR_SCHEMA.$id, TF_IR_SCHEMA);
      assert.equal(IR_SCHEMA.properties.schema.const, TF_IR_SCHEMA);
      assert.equal(IR_SCHEMA.properties.irVersion.const, TF_IR_VERSION);
    },
  },
  {
    name: "ir contract parity: schema enums stay aligned with canonical contract values",
    fn: async () => {
      for (const [defName, values] of ENUM_PARITY_CASES) {
        assert.deepEqual(
          (IR_SCHEMA.$defs as Record<string, { enum?: readonly string[] }>)[defName]?.enum,
          values,
          `schema enum drift for ${defName}`
        );
      }
    },
  },
  {
    name: "ir contract parity: schema reuses canonical slice values for related subsets",
    fn: async () => {
      const defs = IR_SCHEMA.$defs as Record<string, any>;
      assert.deepEqual(
        defs.RefPoint?.properties?.locator?.$ref,
        "#/$defs/PointLocator"
      );
      assert.deepEqual(
        defs.Shell?.properties?.direction?.enum,
        TRIM_SURFACE_KEEPS.slice(0, 2)
      );
      assert.deepEqual(
        defs.ExprBinary?.properties?.op?.enum,
        EXPR_BINARY_OPERATORS
      );
      assert.deepEqual(
        defs.ExtendSurface?.properties?.mode?.$ref,
        "#/$defs/ExtendSurfaceMode"
      );
      const featureRefs = (defs.IntentFeature?.anyOf ?? []).map((entry: { $ref?: string }) => entry.$ref);
      assert.equal(featureRefs.includes("#/$defs/TrimSurface"), true);
      assert.equal(featureRefs.includes("#/$defs/ExtendSurface"), true);
      assert.equal(featureRefs.includes("#/$defs/Knit"), true);
    },
  },
  {
    name: "ir contract parity: schema subset defs stay aligned with canonical values",
    fn: async () => {
      const defs = IR_SCHEMA.$defs as Record<string, any>;
      assert.deepEqual(
        defs.TrimSurface?.properties?.keep?.enum,
        TRIM_SURFACE_KEEPS
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
