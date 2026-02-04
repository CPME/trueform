import {
  CompileResult,
  IntentDocument,
  IntentFeature,
  IntentPart,
  Profile,
  ProfileRef,
  Scalar,
  Selector,
} from "./dsl.js";
import { buildDependencyGraph, topoSortDeterministic } from "./graph.js";
import { buildParamContext, normalizeScalar, ParamOverrides } from "./params.js";
import { normalizeSelector } from "./selectors.js";
import { hashFeature } from "./hash.js";

export type CompiledPart = {
  partId: string;
  order: string[];
  hashes: Map<string, string>;
};

export function compileDocument(
  doc: IntentDocument,
  overrides?: Record<string, ParamOverrides>
): CompileResult[] {
  warnPlaceholders(doc);
  return doc.parts.map((part) => compilePart(part, overrides?.[part.id]));
}

export function compilePart(
  part: IntentPart,
  overrides?: ParamOverrides
): CompileResult {
  const normalized = normalizePart(part, overrides);
  return compileNormalizedPart(normalized);
}

export function compilePartWithHashes(part: IntentPart): CompiledPart {
  const normalized = normalizePart(part);
  const graph = buildDependencyGraph({ ...normalized, features: normalized.features });
  const order = topoSortDeterministic(normalized.features, graph);
  const hashes = new Map<string, string>();
  for (const id of order) {
    const feature = normalized.features.find((f) => f.id === id) as IntentFeature;
    hashes.set(id, hashFeature(feature));
  }
  return { partId: normalized.id, order, hashes };
}

export function normalizePart(
  part: IntentPart,
  overrides?: ParamOverrides
): IntentPart {
  if (part.constraints && part.constraints.length > 0) {
    console.warn(
      `TrueForm: Part constraints are a data-only placeholder in v1; constraints are not evaluated (part ${part.id}).`
    );
  }
  if (part.assertions && part.assertions.length > 0) {
    console.warn(
      `TrueForm: Part assertions are a data-only placeholder in v1; assertions are not evaluated (part ${part.id}).`
    );
  }
  const ctx = buildParamContext(part.params, overrides);
  const features = part.features.map((feature) => normalizeFeature(feature, ctx));
  return { ...part, features };
}

export function compileNormalizedPart(part: IntentPart): CompileResult {
  const graph = buildDependencyGraph(part);
  const order = topoSortDeterministic(part.features, graph);
  return { partId: part.id, featureOrder: order, graph };
}

function normalizeFeature(
  feature: IntentFeature,
  ctx: ReturnType<typeof buildParamContext>
): IntentFeature {
  const clone = { ...feature } as IntentFeature;
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

  switch (clone.kind) {
    case "feature.sketch2d":
      clone.profiles = clone.profiles.map((entry) => ({
        ...entry,
        profile: normalizeProfile(entry.profile, ctx),
      }));
      break;
    case "feature.extrude":
      clone.profile = normalizeProfileRef(clone.profile, ctx);
      clone.depth = normalizeDepth(clone.depth, ctx);
      break;
    case "feature.revolve":
      clone.profile = normalizeProfileRef(clone.profile, ctx);
      clone.angle = normalizeAngle(clone.angle, ctx);
      break;
    case "feature.hole":
      clone.diameter = normalizeScalar(clone.diameter, "length", ctx);
      clone.depth = normalizeDepth(clone.depth, ctx);
      break;
    case "feature.fillet":
      clone.radius = normalizeScalar(clone.radius, "length", ctx);
      break;
    case "feature.chamfer":
      clone.distance = normalizeScalar(clone.distance, "length", ctx);
      break;
    case "pattern.linear":
      clone.spacing = [
        normalizeScalar(clone.spacing[0], "length", ctx),
        normalizeScalar(clone.spacing[1], "length", ctx),
      ];
      clone.count = [
        normalizeScalar(clone.count[0], "count", ctx),
        normalizeScalar(clone.count[1], "count", ctx),
      ];
      break;
    case "pattern.circular":
      clone.count = normalizeScalar(clone.count, "count", ctx);
      break;
    default:
      break;
  }

  return clone;
}

function normalizeProfile(profile: Profile, ctx: ReturnType<typeof buildParamContext>): Profile {
  switch (profile.kind) {
    case "profile.rectangle":
      return {
        ...profile,
        width: normalizeScalar(profile.width, "length", ctx),
        height: normalizeScalar(profile.height, "length", ctx),
      };
    case "profile.circle":
      return {
        ...profile,
        radius: normalizeScalar(profile.radius, "length", ctx),
      };
  }
}

function normalizeProfileRef(
  profile: ProfileRef,
  ctx: ReturnType<typeof buildParamContext>
): ProfileRef {
  if (profile.kind === "profile.ref") return profile;
  return normalizeProfile(profile, ctx);
}

function normalizeDepth(
  depth: Scalar | "throughAll",
  ctx: ReturnType<typeof buildParamContext>
): number | "throughAll" {
  if (depth === "throughAll") return depth;
  return normalizeScalar(depth, "length", ctx);
}

function normalizeAngle(
  angle: Scalar | "full" | undefined,
  ctx: ReturnType<typeof buildParamContext>
): number | "full" | undefined {
  if (angle === undefined || angle === "full") return angle;
  return normalizeScalar(angle, "angle", ctx);
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
      "TrueForm: Assertions are a data-only placeholder in v1; assertions are not evaluated."
    );
  }
}

function isSelector(value: unknown): value is Selector {
  return Boolean(value) && typeof value === "object" && "kind" in (value as object);
}
