import type { KernelResult } from "../backend.js";
import type { BooleanOp } from "../ir.js";
import type { BooleanContext } from "./operation_contexts.js";

export function execBoolean(
  ctx: BooleanContext,
  feature: BooleanOp,
  upstream: KernelResult
): KernelResult {
  const leftSelection = ctx.resolve(feature.left, upstream);
  const rightSelection = ctx.resolve(feature.right, upstream);
  const left = ctx.resolveOwnerShape(leftSelection, upstream);
  const right = ctx.resolveOwnerShape(rightSelection, upstream);
  if (!left || !right) {
    throw new Error("OCCT backend: boolean inputs must resolve to solids");
  }

  const builder = ctx.makeBoolean(feature.op, left, right);
  let solid = ctx.readShape(builder);
  if (feature.op === "subtract") {
    solid = ctx.splitByTools(solid, [left, right]);
  }
  solid = ctx.normalizeSolid(solid);

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:solid`,
        kind: "solid" as const,
        meta: { shape: solid },
      },
    ],
  ]);
  const selections = ctx.collectSelections(solid, feature.id, feature.result, feature.tags, {
    ledgerPlan: ctx.makeBooleanSelectionLedgerPlan(feature.op, upstream, left, right, builder),
  });
  return { outputs, selections };
}
