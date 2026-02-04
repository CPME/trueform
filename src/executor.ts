import { Backend, KernelResult, KernelSelection } from "./backend.js";
import { compileNormalizedPart, normalizePart } from "./compiler.js";
import { IntentPart, Selector } from "./dsl.js";
import { ParamOverrides } from "./params.js";
import { resolveSelector } from "./selectors.js";

export type FeatureStep = {
  featureId: string;
  result: KernelResult;
};

export type BuildResult = {
  partId: string;
  order: string[];
  final: KernelResult;
  steps: FeatureStep[];
};

export function buildPart(
  part: IntentPart,
  backend: Backend,
  overrides?: ParamOverrides
): BuildResult {
  const normalized = normalizePart(part, overrides);
  const compiled = compileNormalizedPart(normalized);
  const byId = new Map(normalized.features.map((f) => [f.id, f]));

  let current: KernelResult = { outputs: new Map(), selections: [] };
  const steps: FeatureStep[] = [];

  for (const id of compiled.featureOrder) {
    const feature = byId.get(id);
    if (!feature) throw new Error(`Missing feature ${id}`);

    const result = backend.execute({
      feature,
      upstream: current,
      resolve: (selector: Selector, upstream: KernelResult) =>
        resolveSelector(selector, toResolutionContext(upstream)),
    });

    current = mergeResults(current, result);
    steps.push({ featureId: id, result });
  }

  return {
    partId: compiled.partId,
    order: compiled.featureOrder,
    final: current,
    steps,
  };
}

function mergeResults(a: KernelResult, b: KernelResult): KernelResult {
  const outputs = new Map(a.outputs);
  for (const [key, value] of b.outputs) outputs.set(key, value);
  const selections = a.selections.concat(b.selections);
  return { outputs, selections };
}

function toResolutionContext(upstream: KernelResult) {
  const named = new Map<string, KernelSelection>();
  for (const [key, obj] of upstream.outputs) {
    if (obj.kind === "face" || obj.kind === "edge" || obj.kind === "solid") {
      named.set(key, { id: obj.id, kind: obj.kind, meta: obj.meta });
    }
  }
  return { selections: upstream.selections, named };
}
