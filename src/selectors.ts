import {
  FaceQuery,
  RankRule,
  Selector,
  ID,
  NamedOutput,
  Predicate,
} from "./dsl.js";
import { CompileError } from "./errors.js";

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
  const ranked = resolveSelectorSet(selector, ctx);
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

export function resolveSelectorSet(
  selector: Selector,
  ctx: ResolutionContext
): Selection[] {
  if (selector.kind === "selector.named") {
    return [resolveNamed(selector, ctx)];
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

  const ranked = applyRanking(candidates, selector.rank, ctx);
  if (ranked.length === 0) {
    throw new CompileError(
      "selector_empty_after_rank",
      "Selector ranking produced no candidates"
    );
  }
  return ranked;
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

function applyRanking(
  candidates: Selection[],
  rank: RankRule[],
  ctx: ResolutionContext
): Selection[] {
  if (rank.length === 0) return candidates;
  validateRankingMetadata(candidates, rank, ctx);
  let current = candidates.slice();
  for (const rule of rank) {
    current = rankOnce(current, rule, ctx);
    if (current.length === 1) return current;
  }
  return current;
}

function rankOnce(
  candidates: Selection[],
  rule: RankRule,
  ctx: ResolutionContext
): Selection[] {
  if (candidates.length <= 1) return candidates;
  if (rule.kind === "rank.closestTo") {
    const target = resolveSelector(rule.target, ctx);
    const targetCenter = selectionCenter(target);
    const scored = candidates.map((c) => ({
      c,
      score: -distance(selectionCenter(c), targetCenter),
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return [];
    return scored.filter((s) => s.score === best.score).map((s) => s.c);
  }
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
    default:
      return 0;
  }
}

function validateRankingMetadata(
  candidates: Selection[],
  rank: RankRule[],
  ctx: ResolutionContext
): void {
  for (const rule of rank) {
    if (rule.kind === "rank.closestTo") {
      const target = resolveSelector(rule.target, ctx);
      selectionCenter(target);
      for (const candidate of candidates) {
        selectionCenter(candidate);
      }
      continue;
    }
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

function selectionCenter(selection: Selection): [number, number, number] {
  const value = selection.meta["center"];
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number")
  ) {
    throw new CompileError(
      "selector_meta_missing",
      "Selector requires center metadata"
    );
  }
  return value as [number, number, number];
}

function distance(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
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
