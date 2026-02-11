import type { Backend, KernelResult, KernelSelection, KernelObject, MeshOptions } from "./backend.js";
import type { IntentAssertion, IntentPart, Units, ID, Selector } from "./ir.js";
import { buildParamContext, normalizeScalar, ParamOverrides } from "./params.js";
import { resolveSelector } from "./selectors.js";

export type AssertionStatus = "ok" | "fail" | "unsupported";

export type AssertionResult = {
  id: ID;
  kind: IntentAssertion["kind"];
  status: AssertionStatus;
  ok: boolean;
  message?: string;
  details?: Record<string, unknown>;
};

export type AssertionEvalOptions = {
  overrides?: ParamOverrides;
  units?: Units;
  mesh?: MeshOptions;
};

export function evaluatePartAssertions(
  part: IntentPart,
  result: KernelResult,
  backend: Backend,
  options: AssertionEvalOptions = {}
): AssertionResult[] {
  const assertions = part.assertions ?? [];
  if (assertions.length === 0) return [];

  const ctx = buildParamContext(part.params, options.overrides, options.units ?? "mm");
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    const target = resolveAssertionTarget(assertion, result);
    if (!target) {
      results.push({
        id: assertion.id,
        kind: assertion.kind,
        status: "unsupported",
        ok: false,
        message: "Assertion target could not be resolved",
      });
      continue;
    }

    if (assertion.kind === "assert.brepValid") {
      if (!backend.checkValid) {
        results.push({
          id: assertion.id,
          kind: assertion.kind,
          status: "unsupported",
          ok: false,
          message: "Backend does not expose checkValid",
        });
        continue;
      }
      const ok = backend.checkValid(target);
      results.push({
        id: assertion.id,
        kind: assertion.kind,
        status: ok ? "ok" : "fail",
        ok,
      });
      continue;
    }

    if (assertion.kind === "assert.minEdgeLength") {
      const threshold = normalizeScalar(assertion.min, "length", ctx);
      const mesh = backend.mesh(target, {
        ...options.mesh,
        includeEdges: true,
      });
      const minLength = minEdgeLength(mesh.edgePositions ?? []);
      if (minLength === null) {
        results.push({
          id: assertion.id,
          kind: assertion.kind,
          status: "unsupported",
          ok: false,
          message: "Backend did not provide edge samples for minEdgeLength",
        });
        continue;
      }
      const ok = minLength >= threshold;
      results.push({
        id: assertion.id,
        kind: assertion.kind,
        status: ok ? "ok" : "fail",
        ok,
        details: { minLength, threshold },
      });
      continue;
    }

  }

  return results;
}

function resolveAssertionTarget(
  assertion: IntentAssertion,
  result: KernelResult
): KernelObject | null {
  if (assertion.target) {
    const selection = resolveSelector(assertion.target, toResolutionContext(result));
    const ownerKey = selection.meta["ownerKey"];
    if (typeof ownerKey === "string") {
      return result.outputs.get(ownerKey) ?? null;
    }
    return null;
  }
  return result.outputs.get("body:main") ?? firstOutput(result);
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

function firstOutput(result: KernelResult): KernelObject | null {
  for (const obj of result.outputs.values()) return obj;
  return null;
}

function minEdgeLength(edgePositions: number[]): number | null {
  if (edgePositions.length < 6) return null;
  let min = Infinity;
  for (let i = 0; i + 5 < edgePositions.length; i += 6) {
    const ax = edgePositions[i] ?? 0;
    const ay = edgePositions[i + 1] ?? 0;
    const az = edgePositions[i + 2] ?? 0;
    const bx = edgePositions[i + 3] ?? 0;
    const by = edgePositions[i + 4] ?? 0;
    const bz = edgePositions[i + 5] ?? 0;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < min) min = len;
  }
  return Number.isFinite(min) ? min : null;
}
