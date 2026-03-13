import type { CompileResult, Graph, IntentFeature, IntentPart, Units } from "./ir.js";
import { buildDependencyGraph, topoSortDeterministic } from "./graph.js";
import { hashFeature } from "./hash.js";
import { normalizePart } from "./ir_normalize.js";
import type { ParamOverrides } from "./params.js";
import type { ValidationOptions } from "./validate.js";

export type PreparedPart = {
  normalized: IntentPart;
  graph: Graph;
  featureOrder: string[];
  featureHashes: Record<string, string>;
  featureById: Map<string, IntentFeature>;
};

export function preparePart(
  part: IntentPart,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units
): PreparedPart {
  const normalized = normalizePart(part, overrides, options, units);
  return prepareNormalizedPart(normalized);
}

export function prepareNormalizedPart(part: IntentPart): PreparedPart {
  const graph = buildDependencyGraph(part);
  const featureOrder = topoSortDeterministic(part.features, graph);
  const featureById = new Map<string, IntentFeature>();
  const featureHashes: Record<string, string> = {};
  for (const feature of part.features) {
    featureById.set(feature.id, feature);
    featureHashes[feature.id] = hashFeature(feature);
  }
  return {
    normalized: part,
    graph,
    featureOrder,
    featureHashes,
    featureById,
  };
}

export function compilePreparedPart(part: PreparedPart): CompileResult {
  return {
    partId: part.normalized.id,
    featureOrder: part.featureOrder,
    graph: part.graph,
  };
}
