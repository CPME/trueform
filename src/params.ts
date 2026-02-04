import {
  AngleUnit,
  Expr,
  ID,
  LengthUnit,
  ParamDef,
  ParamType,
  Scalar,
  Unit,
} from "./dsl.js";
import { CompileError } from "./graph.js";

export type ParamOverrides = Record<ID, Scalar>;

export type ParamValue = {
  type: ParamType;
  value: number;
};

type ParamEval = ParamValue & { fromUnitless: boolean };

export type ParamContext = {
  values: Map<ID, ParamValue>;
};

const LENGTH_TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
};

const ANGLE_TO_RAD: Record<AngleUnit, number> = {
  rad: 1,
  deg: Math.PI / 180,
};

export function buildParamContext(
  params: ParamDef[] | undefined,
  overrides?: ParamOverrides
): ParamContext {
  const defs = new Map<ID, ParamDef>();
  for (const param of params ?? []) {
    if (defs.has(param.id)) {
      throw new CompileError("param_duplicate", `Duplicate param id ${param.id}`);
    }
    defs.set(param.id, param);
  }

  for (const key of Object.keys(overrides ?? {})) {
    if (!defs.has(key)) {
      throw new CompileError("param_override_missing", `Unknown param override ${key}`);
    }
  }

  const values = new Map<ID, ParamValue>();
  const visiting = new Set<ID>();

  const evalParam = (id: ID): ParamValue => {
    const cached = values.get(id);
    if (cached) return cached;
    if (visiting.has(id)) {
      throw new CompileError("param_cycle", `Param dependency cycle at ${id}`);
    }
    const def = defs.get(id);
    if (!def) {
      throw new CompileError("param_missing", `Unknown param ${id}`);
    }
    visiting.add(id);
    const override = overrides?.[id];
    const expr: Expr =
      override === undefined
        ? def.value
        : typeof override === "number"
          ? { kind: "expr.literal", value: override }
          : override;
    const evaluated = evalExpr(expr, def.type, evalParam);
    const normalized = coerceToExpected(def.type, evaluated, `param ${id}`);
    values.set(id, { type: def.type, value: normalized.value });
    visiting.delete(id);
    return { type: def.type, value: normalized.value };
  };

  for (const id of defs.keys()) {
    evalParam(id);
  }

  return { values };
}

export function normalizeScalar(
  value: Scalar,
  expectedType: ParamType,
  ctx: ParamContext
): number {
  const expr: Expr =
    typeof value === "number" ? { kind: "expr.literal", value } : value;
  const evaluated = evalExpr(expr, expectedType, (id) => resolveParam(ctx, id));
  const normalized = coerceToExpected(expectedType, evaluated, "value");
  return normalized.value;
}

function resolveParam(ctx: ParamContext, id: ID): ParamValue {
  const hit = ctx.values.get(id);
  if (!hit) {
    throw new CompileError("param_missing", `Unknown param ${id}`);
  }
  return hit;
}

function evalExpr(
  expr: Expr,
  expectedType: ParamType,
  resolveParam: (id: ID) => ParamValue
): ParamEval {
  switch (expr.kind) {
    case "expr.literal":
      return evalLiteral(expr.value, expr.unit, expectedType);
    case "expr.param": {
      const param = resolveParam(expr.id);
      return { ...param, fromUnitless: false };
    }
    case "expr.neg": {
      const inner = evalExpr(expr.value, expectedType, resolveParam);
      return { ...inner, value: -inner.value };
    }
    case "expr.binary":
      return evalBinary(expr, expectedType, resolveParam);
  }
}

function evalLiteral(value: number, unit: Unit | undefined, expected: ParamType): ParamEval {
  if (unit === undefined) {
    return { type: "count", value, fromUnitless: true };
  }
  const type = unitType(unit);
  const converted =
    type === "length"
      ? value * LENGTH_TO_MM[unit as LengthUnit]
      : value * ANGLE_TO_RAD[unit as AngleUnit];
  if (type !== expected && expected !== "count") {
    throw new CompileError(
      "param_unit_mismatch",
      `Expected ${expected} but got ${unit}`
    );
  }
  return { type, value: converted, fromUnitless: false };
}

function evalBinary(
  expr: Extract<Expr, { kind: "expr.binary" }>,
  expectedType: ParamType,
  resolveParam: (id: ID) => ParamValue
): ParamEval {
  const left = evalExpr(expr.left, expectedType, resolveParam);
  const right = evalExpr(expr.right, expectedType, resolveParam);

  if (expr.op === "+" || expr.op === "-") {
    const coerced = coerceUnitlessForAdd(left, right);
    if (coerced.left.type !== coerced.right.type) {
      throw new CompileError(
        "param_type_mismatch",
        `Cannot ${expr.op} ${coerced.left.type} and ${coerced.right.type}`
      );
    }
    return {
      type: coerced.left.type,
      value:
        expr.op === "+"
          ? coerced.left.value + coerced.right.value
          : coerced.left.value - coerced.right.value,
      fromUnitless: false,
    };
  }

  if (expr.op === "*") {
    const result = multiplyTypes(left, right);
    return { ...result, value: left.value * right.value, fromUnitless: false };
  }

  if (expr.op === "/") {
    if (right.value === 0) {
      throw new CompileError("param_div_zero", "Division by zero in expression");
    }
    const result = divideTypes(left, right);
    return { ...result, value: left.value / right.value, fromUnitless: false };
  }

  throw new CompileError("param_op_unknown", `Unknown operator ${expr.op}`);
}

function coerceUnitlessForAdd(left: ParamEval, right: ParamEval) {
  if (left.type === right.type) return { left, right };
  if (left.fromUnitless && right.type !== "count") {
    return {
      left: { type: right.type, value: left.value, fromUnitless: false },
      right,
    };
  }
  if (right.fromUnitless && left.type !== "count") {
    return {
      left,
      right: { type: left.type, value: right.value, fromUnitless: false },
    };
  }
  return { left, right };
}

function multiplyTypes(left: ParamEval, right: ParamEval): ParamEval {
  if (left.type === "count" && right.type === "count") {
    return { type: "count", value: 0, fromUnitless: false };
  }
  if (left.type === "count") {
    return { type: right.type, value: 0, fromUnitless: false };
  }
  if (right.type === "count") {
    return { type: left.type, value: 0, fromUnitless: false };
  }
  throw new CompileError(
    "param_type_mismatch",
    `Cannot multiply ${left.type} and ${right.type}`
  );
}

function divideTypes(left: ParamEval, right: ParamEval): ParamEval {
  if (left.type === "count" && right.type === "count") {
    return { type: "count", value: 0, fromUnitless: false };
  }
  if (right.type === "count") {
    return { type: left.type, value: 0, fromUnitless: false };
  }
  throw new CompileError(
    "param_type_mismatch",
    `Cannot divide ${left.type} by ${right.type}`
  );
}

function coerceToExpected(
  expected: ParamType,
  value: ParamEval,
  label: string
): ParamValue {
  if (value.type === expected) {
    return { type: value.type, value: value.value };
  }
  if (value.fromUnitless && expected !== "count") {
    return { type: expected, value: value.value };
  }
  throw new CompileError(
    "param_type_mismatch",
    `Expected ${expected} ${label}, got ${value.type}`
  );
}

function unitType(unit: Unit): ParamType {
  if (unit === "deg" || unit === "rad") return "angle";
  return "length";
}
