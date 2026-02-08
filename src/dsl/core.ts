import type {
  BuildContext,
  Expr,
  ID,
  IntentAssembly,
  IntentDocument,
  IntentFeature,
  IntentPart,
  MateConnector,
  ParamDef,
  Unit,
} from "../dsl.js";
import { compact } from "./utils.js";

export const context = (overrides: Partial<BuildContext> = {}): BuildContext => ({
  units: overrides.units ?? "mm",
  kernel: {
    name: overrides.kernel?.name ?? "opencascade.js",
    version: overrides.kernel?.version ?? "unknown",
  },
  tolerance: {
    linear: overrides.tolerance?.linear ?? 0.01,
    angular: overrides.tolerance?.angular ?? 0.001,
  },
});

export const document = (
  id: ID,
  parts: IntentPart[],
  ctx?: BuildContext,
  assemblies?: IntentAssembly[],
  opts?: {
    capabilities?: IntentDocument["capabilities"];
    constraints?: IntentDocument["constraints"];
    assertions?: IntentDocument["assertions"];
  }
): IntentDocument =>
  compact({
    id,
    parts,
    assemblies,
    context: ctx ?? context(),
    capabilities: opts?.capabilities,
    constraints: opts?.constraints,
    assertions: opts?.assertions,
  });

export const part = (
  id: ID,
  features: IntentFeature[],
  opts?: {
    params?: ParamDef[];
    connectors?: MateConnector[];
    datums?: IntentPart["datums"];
    constraints?: IntentPart["constraints"];
    assertions?: IntentPart["assertions"];
  }
): IntentPart =>
  compact({
    id,
    features,
    params: opts?.params,
    connectors: opts?.connectors,
    datums: opts?.datums,
    constraints: opts?.constraints,
    assertions: opts?.assertions,
  });

export const withTags = <T extends IntentFeature>(feature: T, tags: string[]): T => ({
  ...feature,
  tags,
});

export const paramLength = (id: ID, value: Expr): ParamDef => ({
  id,
  type: "length",
  value,
});

export const paramAngle = (id: ID, value: Expr): ParamDef => ({
  id,
  type: "angle",
  value,
});

export const paramCount = (id: ID, value: Expr): ParamDef => ({
  id,
  type: "count",
  value,
});

export const exprLiteral = (value: number, unit?: Unit): Expr =>
  unit ? { kind: "expr.literal", value, unit } : { kind: "expr.literal", value };

export const exprParam = (id: ID): Expr => ({ kind: "expr.param", id });

export const exprAdd = (left: Expr, right: Expr): Expr => ({
  kind: "expr.binary",
  op: "+",
  left,
  right,
});

export const exprSub = (left: Expr, right: Expr): Expr => ({
  kind: "expr.binary",
  op: "-",
  left,
  right,
});

export const exprMul = (left: Expr, right: Expr): Expr => ({
  kind: "expr.binary",
  op: "*",
  left,
  right,
});

export const exprDiv = (left: Expr, right: Expr): Expr => ({
  kind: "expr.binary",
  op: "/",
  left,
  right,
});

export const exprNeg = (value: Expr): Expr => ({ kind: "expr.neg", value });
