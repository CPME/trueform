import {
  FaceQuery,
  RankRule,
  Selector,
  ID,
  NamedOutput,
  Predicate,
} from "./dsl.js";
import { CompileError } from "./graph.js";

export type Selection = {
  id: ID;
  kind: "face" | "edge" | "solid";
  meta: Record<string, unknown>;
};

export type ResolutionContext = {
  selections: Selection[];
  named: Map<string, Selection>;
};

export function resolveSelector(selector: Selector, ctx: ResolutionContext): Selection {
  if (selector.kind === "selector.named") {
    return resolveNamed(selector, ctx);
  }

  const candidates = ctx.selections.filter((s) => {
    if (selector.kind === "selector.face" && s.kind !== "face") return false;
    if (selector.kind === "selector.edge" && s.kind !== "edge") return false;
    if (selector.kind === "selector.solid" && s.kind !== "solid") return false;
    return selector.predicates.every((p) => predicateMatches(p, s));
  });

  if (candidates.length === 0) {
    throw new CompileError("selector_empty", "Selector matched 0 candidates");
  }

  const ranked = applyRanking(candidates, selector.rank);
  if (ranked.length !== 1) {
    throw new CompileError(
      "selector_ambiguous",
      "Selector ambiguity: add ranking or tighten predicates"
    );
  }

  const single = ranked[0];
  if (!single) {
    throw new CompileError(
      "selector_empty_after_rank",
      "Selector ranking produced no candidates"
    );
  }
  return single;
}

function resolveNamed(selector: NamedOutput, ctx: ResolutionContext): Selection {
  const hit = ctx.named.get(selector.name);
  if (!hit) {
    throw new CompileError("selector_named_missing", `Missing named output ${selector.name}`);
  }
  return hit;
}

function predicateMatches(predicate: Predicate, selection: Selection): boolean {
  switch (predicate.kind) {
    case "pred.planar":
      return requireBool(selection, "planar") === true;
    case "pred.normal":
      return requireString(selection, "normal") === predicate.value;
    case "pred.createdBy":
      return requireString(selection, "createdBy") === predicate.featureId;
    case "pred.role":
      return requireString(selection, "role") === predicate.value;
    default:
      return false;
  }
}

function applyRanking(candidates: Selection[], rank: RankRule[]): Selection[] {
  if (rank.length === 0) return candidates;
  validateRankingMetadata(candidates, rank);
  let current = candidates.slice();
  for (const rule of rank) {
    current = rankOnce(current, rule);
    if (current.length === 1) return current;
  }
  return current;
}

function rankOnce(candidates: Selection[], rule: RankRule): Selection[] {
  if (candidates.length <= 1) return candidates;
  const scored = candidates.map((c) => ({ c, score: scoreForRule(c, rule) }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return [];
  return scored.filter((s) => s.score === best.score).map((s) => s.c);
}

function scoreForRule(selection: Selection, rule: RankRule): number {
  switch (rule.kind) {
    case "rank.maxArea":
      return requireNumber(selection, "area");
    case "rank.minZ":
      return -requireNumber(selection, "centerZ");
    case "rank.maxZ":
      return requireNumber(selection, "centerZ");
    case "rank.closestTo":
      return -requireNumber(selection, "distanceTo");
    default:
      return 0;
  }
}

function validateRankingMetadata(candidates: Selection[], rank: RankRule[]) {
  for (const rule of rank) {
    for (const candidate of candidates) {
      void scoreForRule(candidate, rule);
    }
  }
}

function requireNumber(selection: Selection, key: string): number {
  const value = selection.meta[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new CompileError(
      "selector_meta_missing",
      `Selector requires numeric metadata ${key}`
    );
  }
  return value;
}

function requireString(selection: Selection, key: string): string {
  const value = selection.meta[key];
  if (typeof value !== "string") {
    throw new CompileError(
      "selector_meta_missing",
      `Selector requires string metadata ${key}`
    );
  }
  return value;
}

function requireBool(selection: Selection, key: string): boolean {
  const value = selection.meta[key];
  if (typeof value !== "boolean") {
    throw new CompileError(
      "selector_meta_missing",
      `Selector requires boolean metadata ${key}`
    );
  }
  return value;
}

export function normalizeSelector(selector: Selector): Selector {
  if (selector.kind === "selector.named") return selector;
  return {
    ...selector,
    predicates: normalizePredicates(selector.predicates),
    rank: normalizeRank(selector.rank),
  } as FaceQuery;
}

function normalizePredicates(predicates: Predicate[]): Predicate[] {
  const seen = new Set<string>();
  const result: Predicate[] = [];
  for (const p of predicates) {
    const key = JSON.stringify(p);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result;
}

function normalizeRank(rank: RankRule[]): RankRule[] {
  const seen = new Set<string>();
  const result: RankRule[] = [];
  for (const r of rank) {
    const key = JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(r);
  }
  return result;
}
