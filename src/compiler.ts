import { CompileResult, IntentDocument, IntentFeature, IntentPart, Units } from "./ir.js";
import { buildDependencyGraph, topoSortDeterministic } from "./graph.js";
import { ParamOverrides } from "./params.js";
import { hashFeature } from "./hash.js";
import { shouldValidate, validateDocument, type ValidationOptions } from "./ir_validate.js";
import { normalizePart } from "./ir_normalize.js";

export { normalizePart } from "./ir_normalize.js";

export type CompiledPart = {
  partId: string;
  order: string[];
  hashes: Map<string, string>;
};

/** @deprecated Identity helper retained for compatibility. Pass IR directly. */
export function emitIrDocument(doc: IntentDocument): IntentDocument {
  return doc;
}

/** @deprecated Identity helper retained for compatibility. Pass IR directly. */
export function emitIrPart(part: IntentPart): IntentPart {
  return part;
}

export function compileDocument(
  doc: IntentDocument,
  overrides?: Record<string, ParamOverrides>,
  options?: ValidationOptions
): CompileResult[] {
  if (shouldValidate(options)) validateDocument(doc);
  warnPlaceholders(doc);
  return doc.parts.map((part) =>
    compilePart(part, overrides?.[part.id], options, doc.context?.units)
  );
}

export function compilePart(
  part: IntentPart,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units
): CompileResult {
  const normalized = normalizePart(part, overrides, options, units);
  return compileNormalizedPart(normalized);
}

export function compilePartWithHashes(
  part: IntentPart,
  options?: ValidationOptions,
  units?: Units
): CompiledPart {
  const normalized = normalizePart(part, undefined, options, units);
  const graph = buildDependencyGraph({ ...normalized, features: normalized.features });
  const order = topoSortDeterministic(normalized.features, graph);
  const hashes = new Map<string, string>();
  for (const id of order) {
    const feature = normalized.features.find((f) => f.id === id) as IntentFeature;
    hashes.set(id, hashFeature(feature));
  }
  return { partId: normalized.id, order, hashes };
}

export function compileNormalizedPart(part: IntentPart): CompileResult {
  const graph = buildDependencyGraph(part);
  const order = topoSortDeterministic(part.features, graph);
  return { partId: part.id, featureOrder: order, graph };
}

function warnPlaceholders(doc: IntentDocument) {
  if (doc.assemblies && doc.assemblies.length > 0) {
    console.warn(
      "TrueForm: AssemblyIR is a data-only placeholder in v1; assemblies are ignored during compile."
    );
  }
  if (doc.constraints && doc.constraints.length > 0) {
    console.warn(
      "TrueForm: FTI constraints are a data-only placeholder in v1; constraints are not evaluated."
    );
  }
  if (doc.assertions && doc.assertions.length > 0) {
    console.warn(
      "TrueForm: Assertions are data-only in v1; use evaluatePartAssertions to run them."
    );
  }
}
