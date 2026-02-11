import {
  Backend,
  BackendAsync,
  KernelResult,
  KernelSelection,
  type BackendCapabilities,
} from "./backend.js";
import { compileNormalizedPart } from "./compiler.js";
import { normalizePart } from "./ir_normalize.js";
import { IntentPart, Selector, Units } from "./ir.js";
import { resolveConnectors, type ConnectorFrame } from "./connectors.js";
import { ParamOverrides } from "./params.js";
import { resolveSelector } from "./selectors.js";
import { type ValidationOptions } from "./validate.js";
import { BackendError } from "./errors.js";

export type FeatureStep = {
  featureId: string;
  result: KernelResult;
};

export type BuildResult = {
  partId: string;
  order: string[];
  final: KernelResult;
  steps: FeatureStep[];
  connectors: Map<string, ConnectorFrame>;
};

export function buildPart(
  part: IntentPart,
  backend: Backend,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units
): BuildResult {
  const normalized = normalizePart(part, overrides, options, units);
  const compiled = compileNormalizedPart(normalized);
  const byId = new Map(normalized.features.map((f) => [f.id, f]));
  const caps = backend.capabilities ? backend.capabilities() : undefined;

  let current: KernelResult = { outputs: new Map(), selections: [] };
  const steps: FeatureStep[] = [];

  for (const id of compiled.featureOrder) {
    const feature = byId.get(id);
    if (!feature) throw new Error(`Missing feature ${id}`);
    ensureBackendSupports(caps, feature.kind);

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
    connectors: resolveConnectors(normalized.connectors, current),
  };
}

export async function buildPartAsync(
  part: IntentPart,
  backend: BackendAsync,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units
): Promise<BuildResult> {
  const normalized = normalizePart(part, overrides, options, units);
  const compiled = compileNormalizedPart(normalized);
  const byId = new Map(normalized.features.map((f) => [f.id, f]));
  const caps = backend.capabilities ? await backend.capabilities() : undefined;

  let current: KernelResult = { outputs: new Map(), selections: [] };
  const steps: FeatureStep[] = [];

  for (const id of compiled.featureOrder) {
    const feature = byId.get(id);
    if (!feature) throw new Error(`Missing feature ${id}`);
    ensureBackendSupports(caps, feature.kind);

    const result = await backend.execute({
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
    connectors: resolveConnectors(normalized.connectors, current),
  };
}

function mergeResults(a: KernelResult, b: KernelResult): KernelResult {
  const outputs = new Map(a.outputs);
  for (const [key, value] of b.outputs) outputs.set(key, value);
  const ownerKeys = new Set<string>();
  for (const selection of b.selections) {
    const ownerKey = selection.meta["ownerKey"];
    if (typeof ownerKey === "string") ownerKeys.add(ownerKey);
  }
  const baseSelections =
    ownerKeys.size === 0
      ? a.selections
      : a.selections.filter((selection) => {
          const ownerKey = selection.meta["ownerKey"];
          return typeof ownerKey !== "string" || !ownerKeys.has(ownerKey);
        });
  const selections = baseSelections.concat(b.selections);
  return { outputs, selections };
}

function ensureBackendSupports(caps: BackendCapabilities | undefined, featureKind: string): void {
  if (!caps || !caps.featureKinds) return;
  if (caps.featureKinds.includes(featureKind)) return;
  const name = caps.name ? ` (${caps.name})` : "";
  throw new BackendError(
    "backend_unsupported_feature",
    `Backend${name} does not support feature ${featureKind}`
  );
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
