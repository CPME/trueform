import {
  CompileResult,
  DocumentIR,
  FeatureIR,
  PartIR,
  Selector,
} from "./ir.js";
import { buildDependencyGraph, topoSortDeterministic } from "./graph.js";
import { normalizeSelector } from "./selectors.js";
import { hashFeature } from "./hash.js";

export type CompiledPart = {
  partId: string;
  order: string[];
  hashes: Map<string, string>;
};

export function compileDocument(doc: DocumentIR): CompileResult[] {
  return doc.parts.map((part) => compilePart(part));
}

export function compilePart(part: PartIR): CompileResult {
  const normalizedFeatures = part.features.map(normalizeFeature);
  const graph = buildDependencyGraph({ ...part, features: normalizedFeatures });
  const order = topoSortDeterministic(normalizedFeatures, graph);
  return { partId: part.id, featureOrder: order, graph };
}

export function compilePartWithHashes(part: PartIR): CompiledPart {
  const normalizedFeatures = part.features.map(normalizeFeature);
  const graph = buildDependencyGraph({ ...part, features: normalizedFeatures });
  const order = topoSortDeterministic(normalizedFeatures, graph);
  const hashes = new Map<string, string>();
  for (const id of order) {
    const feature = normalizedFeatures.find((f) => f.id === id) as FeatureIR;
    hashes.set(id, hashFeature(feature));
  }
  return { partId: part.id, order, hashes };
}

function normalizeFeature(feature: FeatureIR): FeatureIR {
  const clone = { ...feature } as FeatureIR;
  if ("on" in clone && isSelector(clone.on)) {
    (clone as { on: Selector }).on = normalizeSelector(clone.on as Selector);
  }
  if ("onFace" in clone && isSelector(clone.onFace)) {
    (clone as { onFace: Selector }).onFace = normalizeSelector(
      clone.onFace as Selector
    );
  }
  if ("edges" in clone && isSelector(clone.edges)) {
    (clone as { edges: Selector }).edges = normalizeSelector(clone.edges as Selector);
  }
  if ("left" in clone && isSelector(clone.left)) {
    (clone as { left: Selector }).left = normalizeSelector(clone.left as Selector);
  }
  if ("right" in clone && isSelector(clone.right)) {
    (clone as { right: Selector }).right = normalizeSelector(clone.right as Selector);
  }
  if ("origin" in clone && isSelector(clone.origin)) {
    (clone as { origin: Selector }).origin = normalizeSelector(
      clone.origin as Selector
    );
  }
  if ("plane" in clone && isSelector(clone.plane)) {
    (clone as { plane: Selector }).plane = normalizeSelector(clone.plane as Selector);
  }
  return clone;
}

function isSelector(value: unknown): value is Selector {
  return Boolean(value) && typeof value === "object" && "kind" in (value as object);
}
