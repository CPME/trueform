import {
  FaceQuery,
  RankRule,
  Selector,
  ID,
  NamedOutput,
  Predicate,
} from "./ir.js";
import { CompileError } from "./errors.js";

export type Selection = {
  id: ID;
  kind: "face" | "edge" | "solid" | "surface";
  meta: Record<string, unknown>;
};

export type ResolutionContext = {
  selections: Selection[];
  named: Map<string, Selection>;
};

export function resolveSelector(selector: Selector, ctx: ResolutionContext): Selection {
  const ranked = resolveSelectorSet(selector, ctx);
  if (ranked.length === 1) {
    const single = ranked[0];
    if (!single) {
      throw new CompileError(
        "selector_empty_after_rank",
        "Selector ranking produced no candidates"
      );
    }
    return single;
  }
  const preferred = pickBestCandidate(ranked);
  if (preferred) return preferred;
  throw new CompileError(
    "selector_ambiguous",
    "Selector ambiguity: add ranking or tighten predicates"
  );
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

function pickBestCandidate(candidates: Selection[]): Selection | undefined {
  if (candidates.length === 0) return undefined;
  let best = candidates[0];
  if (!best) return undefined;
  for (let i = 1; i < candidates.length; i += 1) {
    const next = candidates[i];
    if (!next) continue;
    if (compareCandidates(next, best) > 0) {
      best = next;
    }
  }
  return best;
}

function compareCandidates(a: Selection, b: Selection): number {
  const aKey = candidateKey(a);
  const bKey = candidateKey(b);
  if (aKey.area !== bKey.area) return aKey.area - bKey.area;
  if (aKey.center[2] !== bKey.center[2]) return aKey.center[2] - bKey.center[2];
  if (aKey.center[1] !== bKey.center[1]) return aKey.center[1] - bKey.center[1];
  if (aKey.center[0] !== bKey.center[0]) return aKey.center[0] - bKey.center[0];
  return String(a.id).localeCompare(String(b.id));
}

function candidateKey(selection: Selection): { area: number; center: [number, number, number] } {
  const area =
    selection.kind === "face" ? safeNumber(selection.meta["area"], 0) : 0;
  const center = safeCenter(selection.meta["center"]);
  return { area, center };
}

function safeCenter(value: unknown): [number, number, number] {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  ) {
    return value as [number, number, number];
  }
  return [0, 0, 0];
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
