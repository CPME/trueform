import type { IntentDocument as DslDocument, IntentPart as DslPart } from "./dsl.js";
import { CompileResult, IntentDocument, IntentFeature, IntentPart, Units } from "./ir.js";
import { buildDependencyGraph, topoSortDeterministic } from "./graph.js";
import { ParamOverrides } from "./params.js";
import { hashFeature } from "./hash.js";
import { shouldValidate, validateDocument, type ValidationOptions } from "./ir_validate.js";
import { dslToIrDocument, dslToIrPart } from "./ir_convert.js";
import { normalizePart } from "./ir_normalize.js";

export { normalizePart } from "./ir_normalize.js";

export type CompiledPart = {
  partId: string;
  order: string[];
  hashes: Map<string, string>;
};

export function emitIrDocument(doc: DslDocument): IntentDocument {
  return dslToIrDocument(doc);
}

export function emitIrPart(part: DslPart): IntentPart {
  return dslToIrPart(part);
}

export function compileDocument(
  doc: DslDocument,
  overrides?: Record<string, ParamOverrides>,
  options?: ValidationOptions
): CompileResult[] {
  const irDoc = emitIrDocument(doc);
  if (shouldValidate(options)) validateDocument(irDoc);
  warnPlaceholders(irDoc);
  return irDoc.parts.map((part) =>
    compilePart(part, overrides?.[part.id], options, irDoc.context?.units)
  );
}

export function compilePart(
  part: DslPart,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units
): CompileResult {
  const irPart = emitIrPart(part);
  const normalized = normalizePart(irPart, overrides, options, units);
  return compileNormalizedPart(normalized);
}

export function compilePartWithHashes(
  part: DslPart,
  options?: ValidationOptions,
  units?: Units
): CompiledPart {
  const irPart = emitIrPart(part);
  const normalized = normalizePart(irPart, undefined, options, units);
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
