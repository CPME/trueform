import {
  AxisSpec,
  ExtrudeAxis,
  IntentFeature,
  Graph,
  ID,
  IntentPart,
  PlaneRef,
  ProfileRef,
  Selector,
  RankRule,
  Predicate,
} from "./ir.js";
import { CompileError } from "./errors.js";

export { CompileError } from "./errors.js";

export function buildDependencyGraph(part: IntentPart): Graph {
  const nodes = part.features.map((f) => f.id);
  const byId = new Map<ID, IntentFeature>(part.features.map((f) => [f.id, f]));
  const profileToFeature = buildProfileIndex(part);
  const outputToFeature = buildOutputIndex(part);
  const edges: Array<{ from: ID; to: ID }> = [];

  for (const feature of part.features) {
    const explicitDeps = new Set<ID>(feature.deps ?? []);
    for (const dep of explicitDeps) {
      if (!byId.has(dep)) {
        throw new CompileError(
          "dep_missing",
          `Feature ${feature.id} depends on missing feature ${dep}`
        );
      }
    }

    const inferredDeps = new Set<ID>();

    const profileDeps = inferProfileDependencies(feature, profileToFeature);
    for (const dep of profileDeps) inferredDeps.add(dep);

    const patternDep = inferPatternDependency(feature, byId);
    if (patternDep) inferredDeps.add(patternDep);

    const datumDeps = inferDatumDependencies(feature, byId);
    for (const dep of datumDeps) inferredDeps.add(dep);

    const selectors = featureSelectors(feature);
    for (const selector of selectors) {
      const { deps, anchored } = selectorDependencies(
        selector,
        feature.id,
        byId,
        outputToFeature
      );
      for (const dep of deps) inferredDeps.add(dep);
      if (!anchored && explicitDeps.size === 0) {
        throw new CompileError(
          "selector_anchor_missing",
          `Feature ${feature.id} selector has no anchors and no explicit deps`
        );
      }
    }

    const allDeps = new Set<ID>([...explicitDeps, ...inferredDeps]);
    for (const dep of allDeps) {
      edges.push({ from: dep, to: feature.id });
    }
  }
  return { nodes, edges };
}

function buildProfileIndex(part: IntentPart): Map<string, ID> {
  const profileToFeature = new Map<string, ID>();
  for (const feature of part.features) {
    if (feature.kind !== "feature.sketch2d") continue;
    for (const profile of feature.profiles) {
      const existing = profileToFeature.get(profile.name);
      if (existing) {
        throw new CompileError(
          "profile_duplicate",
          `Duplicate profile name ${profile.name} on features ${existing} and ${feature.id}`
        );
      }
      profileToFeature.set(profile.name, feature.id);
    }
  }
  return profileToFeature;
}

function buildOutputIndex(part: IntentPart): Map<string, ID> {
  const outputToFeature = new Map<string, ID>();
  for (const feature of part.features) {
    const result = featureResultName(feature);
    if (!result) continue;
    const existing = outputToFeature.get(result);
    if (existing) {
      throw new CompileError(
        "output_duplicate",
        `Duplicate output name ${result} on features ${existing} and ${feature.id}`
      );
    }
    outputToFeature.set(result, feature.id);
  }
  return outputToFeature;
}

function featureResultName(feature: IntentFeature): string | undefined {
  switch (feature.kind) {
    case "feature.extrude":
    case "feature.plane":
    case "feature.surface":
    case "feature.revolve":
    case "feature.loft":
    case "feature.sweep":
    case "feature.pipe":
    case "feature.pipeSweep":
    case "feature.hexTubeSweep":
    case "feature.mirror":
    case "feature.draft":
    case "feature.shell":
    case "feature.thicken":
    case "feature.thread":
    case "feature.boolean":
      return feature.result;
    case "pattern.linear":
    case "pattern.circular":
      return typeof feature.result === "string" ? feature.result : undefined;
    default:
      return undefined;
  }
}

function inferProfileDependencies(
  feature: IntentFeature,
  profileToFeature: Map<string, ID>
): Set<ID> {
  const deps = new Set<ID>();
  const refs: ProfileRef[] = [];
  if (
    feature.kind === "feature.extrude" ||
    feature.kind === "feature.surface" ||
    feature.kind === "feature.revolve" ||
    feature.kind === "feature.sweep"
  ) {
    refs.push(feature.profile as ProfileRef);
  } else if (feature.kind === "feature.loft") {
    refs.push(...(feature.profiles as ProfileRef[]));
  } else {
    return deps;
  }
  for (const profile of refs) {
    if (!profile || profile.kind !== "profile.ref") continue;
    const hit = profileToFeature.get(profile.name);
    if (!hit) {
      throw new CompileError(
        "profile_missing",
        `Feature ${feature.id} references missing profile ${profile.name}`
      );
    }
    deps.add(hit);
  }
  return deps;
}

function inferPatternDependency(
  feature: IntentFeature,
  byId: Map<ID, IntentFeature>
): ID | null {
  if (feature.kind !== "feature.hole" || !feature.pattern) return null;
  const ref = feature.pattern.ref;
  const hit = byId.get(ref);
  if (!hit || (hit.kind !== "pattern.linear" && hit.kind !== "pattern.circular")) {
    throw new CompileError(
      "pattern_missing",
      `Feature ${feature.id} references missing pattern ${ref}`
    );
  }
  return ref;
}

function inferDatumDependencies(
  feature: IntentFeature,
  byId: Map<ID, IntentFeature>
): Set<ID> {
  const deps = new Set<ID>();
  switch (feature.kind) {
    case "datum.plane":
      addAxisSpecDep((feature as { normal?: AxisSpec }).normal, deps, byId);
      addAxisSpecDep((feature as { xAxis?: AxisSpec }).xAxis, deps, byId);
      break;
    case "datum.axis":
      addAxisSpecDep((feature as { direction?: AxisSpec }).direction, deps, byId);
      break;
    case "feature.sketch2d":
      addPlaneRefDep((feature as { plane?: PlaneRef }).plane, deps, byId);
      break;
    case "feature.extrude":
      addExtrudeAxisDep((feature as { axis?: ExtrudeAxis }).axis, deps, byId);
      break;
    case "feature.plane":
      addPlaneRefDep((feature as { plane?: PlaneRef }).plane, deps, byId);
      break;
    case "feature.sweep":
      addPlaneRefDep((feature as { frame?: PlaneRef }).frame, deps, byId);
      break;
    case "feature.mirror":
      addPlaneRefDep((feature as { plane?: PlaneRef }).plane, deps, byId);
      break;
    case "feature.draft":
      addPlaneRefDep(
        (feature as { neutralPlane?: PlaneRef }).neutralPlane,
        deps,
        byId
      );
      addAxisSpecDep(
        (feature as { pullDirection?: AxisSpec }).pullDirection,
        deps,
        byId
      );
      break;
    case "feature.thread":
      addAxisSpecDep((feature as { axis?: AxisSpec }).axis, deps, byId);
      break;
    default:
      break;
  }
  return deps;
}

function addPlaneRefDep(
  plane: PlaneRef | undefined,
  deps: Set<ID>,
  byId: Map<ID, IntentFeature>
) {
  if (!plane || isSelector(plane)) return;
  if (plane.kind !== "plane.datum") return;
  const hit = byId.get(plane.ref);
  if (!hit || (hit.kind !== "datum.plane" && hit.kind !== "datum.frame")) {
    throw new CompileError(
      "datum_plane_missing",
      `Missing datum plane/frame ${plane.ref}`
    );
  }
  deps.add(plane.ref);
}

function addAxisSpecDep(
  axis: AxisSpec | undefined,
  deps: Set<ID>,
  byId: Map<ID, IntentFeature>
) {
  if (!axis || typeof axis === "string") return;
  if (axis.kind !== "axis.datum") return;
  const hit = byId.get(axis.ref);
  if (!hit || hit.kind !== "datum.axis") {
    throw new CompileError(
      "datum_axis_missing",
      `Missing datum axis ${axis.ref}`
    );
  }
  deps.add(axis.ref);
}

function addExtrudeAxisDep(
  axis: ExtrudeAxis | undefined,
  deps: Set<ID>,
  byId: Map<ID, IntentFeature>
) {
  if (!axis || (typeof axis === "object" && axis.kind === "axis.sketch.normal")) {
    return;
  }
  addAxisSpecDep(axis as AxisSpec, deps, byId);
}

function featureSelectors(feature: IntentFeature): Selector[] {
  switch (feature.kind) {
    case "datum.frame":
      return [feature.on];
    case "feature.sketch2d":
      if (feature.plane && isSelector(feature.plane)) {
        return [feature.plane];
      }
      return [];
    case "feature.plane":
      if (feature.plane && isSelector(feature.plane)) {
        return [feature.plane];
      }
      return [];
    case "feature.hole":
      return [feature.onFace];
    case "feature.fillet":
    case "feature.chamfer":
      return [feature.edges];
    case "feature.boolean":
      return [feature.left, feature.right];
    case "feature.mirror":
      return [feature.source];
    case "feature.draft":
      return [feature.source, feature.faces];
    case "feature.shell": {
      const faces = Array.isArray(feature.openFaces) ? feature.openFaces : [];
      return [feature.source, ...faces];
    }
    case "feature.thicken":
      return [feature.surface];
    case "pattern.linear":
    case "pattern.circular":
      return feature.source ? [feature.origin, feature.source] : [feature.origin];
    default:
      return [];
  }
}

function selectorDependencies(
  selector: Selector,
  featureId: ID,
  byId: Map<ID, IntentFeature>,
  outputToFeature: Map<string, ID>
): { deps: Set<ID>; anchored: boolean } {
  const deps = new Set<ID>();

  if (selector.kind === "selector.named") {
    const hit = outputToFeature.get(selector.name);
    if (!hit) {
      throw new CompileError(
        "selector_named_missing",
        `Feature ${featureId} references missing output ${selector.name}`
      );
    }
    deps.add(hit);
    return { deps, anchored: true };
  }

  let anchored = false;
  for (const predicate of selector.predicates as Predicate[]) {
    if (predicate.kind !== "pred.createdBy") continue;
    const hit = byId.get(predicate.featureId);
    if (!hit) {
      throw new CompileError(
        "pred_created_by_missing",
        `Feature ${featureId} references missing feature ${predicate.featureId}`
      );
    }
    deps.add(predicate.featureId);
    anchored = true;
  }

  for (const rule of selector.rank as RankRule[]) {
    if (rule.kind !== "rank.closestTo") continue;
    const nested = selectorDependencies(
      rule.target,
      featureId,
      byId,
      outputToFeature
    );
    for (const dep of nested.deps) deps.add(dep);
    if (nested.anchored) anchored = true;
  }

  return { deps, anchored };
}

function isSelector(value: unknown): value is Selector {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: string }).kind;
  return (
    kind === "selector.face" ||
    kind === "selector.edge" ||
    kind === "selector.solid" ||
    kind === "selector.named"
  );
}

export function topoSortDeterministic(features: IntentFeature[], graph: Graph): ID[] {
  const indegree = new Map<ID, number>();
  for (const node of graph.nodes) indegree.set(node, 0);
  for (const edge of graph.edges) {
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const byId = new Map<ID, IntentFeature>(features.map((f) => [f.id, f]));
  const queue: ID[] = [];
  for (const [id, deg] of indegree) {
    if (deg === 0) queue.push(id);
  }
  queue.sort();

  const result: ID[] = [];
  while (queue.length > 0) {
    const id = queue.shift() as ID;
    result.push(id);
    for (const edge of graph.edges) {
      if (edge.from !== id) continue;
      const next = edge.to;
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) {
        queue.push(next);
        queue.sort();
      }
    }
  }

  if (result.length !== graph.nodes.length) {
    const missing = graph.nodes.filter((n) => !result.includes(n));
    throw new CompileError(
      "cycle",
      `Dependency cycle detected: ${missing.join(", ")}`
    );
  }

  // Enforce stable tie-breaker on deterministic, lexicographic feature IDs.
  for (const id of result) {
    if (!byId.has(id)) {
      throw new CompileError("missing_feature", `Missing feature ${id}`);
    }
  }

  return result;
}
