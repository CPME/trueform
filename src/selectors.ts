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
    return resolveNamedSet(selector, ctx);
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

function resolveNamedSet(selector: NamedOutput, ctx: ResolutionContext): Selection[] {
  const direct = resolveNamedSingle(selector.name, ctx);
  if (direct.selection) return [direct.selection];
  if (direct.error) throw direct.error;

  const tokens = parseNamedTargetList(selector.name);
  if (tokens.length > 1) {
    const resolved: Selection[] = [];
    const seen = new Set<string>();
    for (const token of tokens) {
      const hit = resolveNamedSingle(token, ctx);
      if (!hit.selection) {
        if (hit.error) throw hit.error;
        throw new CompileError("selector_named_missing", `Missing named output ${token}`);
      }
      if (seen.has(hit.selection.id)) continue;
      seen.add(hit.selection.id);
      resolved.push(hit.selection);
    }
    if (resolved.length > 0) return resolved;
  }

  throw new CompileError("selector_named_missing", `Missing named output ${selector.name}`);
}

function resolveNamedSingle(
  name: string,
  ctx: ResolutionContext
): { selection: Selection | null; error?: CompileError } {
  const normalized = name.trim();
  const hit = ctx.named.get(normalized);
  if (hit) return { selection: hit };

  const selectionHit = ctx.selections.find((selection) => selection.id === normalized);
  if (selectionHit) return { selection: selectionHit };

  const aliasHit = ctx.selections.find((selection) => selectionHasAlias(selection, normalized));
  if (aliasHit) return { selection: aliasHit };

  const rebound = resolveStableSelectionRebind(normalized, ctx);
  if (rebound) return { selection: rebound };

  const legacyError = legacyNumericSelectorError(normalized);
  if (legacyError) return { selection: null, error: legacyError };
  return { selection: null };
}

function selectionHasAlias(selection: Selection, target: string): boolean {
  const aliases = selection.meta["selectionAliases"];
  if (!Array.isArray(aliases)) return false;
  return aliases.some((entry) => typeof entry === "string" && entry === target);
}

type ParsedStableSelectionRef = {
  kind: Selection["kind"];
  ownerToken: string;
  createdByToken: string;
  slot: string;
};

type ParsedSelectionSlot =
  | { root: string; relation: "bound" | "join"; target: string }
  | { root: string; relation: "seam" }
  | { root: string; relation: "end"; index: string }
  | { root: string; relation: "edge"; index: string }
  | { root: string; relation: "other" };

function resolveStableSelectionRebind(
  target: string,
  ctx: ResolutionContext
): Selection | null {
  const parsed = parseStableSelectionRef(target);
  if (!parsed) return null;
  const parsedSlot = parseSelectionSlot(parsed.slot);
  if (parsedSlot.relation === "edge") return null;

  const candidates = ctx.selections.filter((selection) => {
    if (selection.kind !== parsed.kind) return false;
    const owner = normalizeSelectionToken(requireMetaString(selection.meta["ownerKey"]));
    const createdBy = normalizeSelectionToken(requireMetaString(selection.meta["createdBy"]));
    return owner === parsed.ownerToken && createdBy === parsed.createdByToken;
  });
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((selection) => ({
      selection,
      score: scoreStableSelectionRebind(parsed, parsedSlot, selection),
    }))
    .filter((entry) => entry.score > 0);
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score || a.selection.id.localeCompare(b.selection.id));
  const best = scored[0];
  if (!best) return null;
  const second = scored[1];
  if (second && second.score === best.score) return null;
  return best.selection;
}

function scoreStableSelectionRebind(
  parsed: ParsedStableSelectionRef,
  parsedSlot: ParsedSelectionSlot,
  selection: Selection
): number {
  const candidateSlot = requireMetaString(selection.meta["selectionSlot"]);
  if (!candidateSlot) return 0;
  if (candidateSlot === parsed.slot) return 100;

  const candidateParsed = parseSelectionSlot(candidateSlot);
  if (candidateParsed.relation === "other") return 0;

  if (parsedSlot.relation === "bound" || parsedSlot.relation === "join") {
    if (candidateParsed.root !== parsedSlot.root) return 0;
    if (candidateParsed.relation === parsedSlot.relation && "target" in candidateParsed) {
      return candidateParsed.target === parsedSlot.target ? 95 : 0;
    }
    if (
      candidateParsed.relation !== "bound" &&
      candidateParsed.relation !== "join"
    ) {
      return 0;
    }
    const label = parsedSlot.root.split(".")[0] ?? "";
    const target = parsedSlot.target;
    const targetLooksDerived = label.length > 0 && target.startsWith(`${label}.`);
    if (
      parsedSlot.relation === "bound" &&
      targetLooksDerived &&
      candidateParsed.relation === "join" &&
      "target" in candidateParsed &&
      candidateParsed.target === target &&
      candidateHasAdjacentFaceSlot(selection, target)
    ) {
      return 90;
    }
    if (
      parsedSlot.relation === "join" &&
      candidateParsed.relation === "bound" &&
      "target" in candidateParsed &&
      candidateParsed.target === target &&
      candidateHasAdjacentFaceSlot(selection, target)
    ) {
      return 70;
    }
    return 0;
  }

  if (parsedSlot.relation === "seam") {
    return candidateParsed.relation === "seam" && candidateParsed.root === parsedSlot.root ? 85 : 0;
  }

  if (parsedSlot.relation === "end") {
    return candidateSlot === `${parsedSlot.root}.end.${parsedSlot.index}` ? 85 : 0;
  }

  return 0;
}

function candidateHasAdjacentFaceSlot(selection: Selection, target: string): boolean {
  const adjacent = selection.meta["adjacentFaceSlots"];
  if (!Array.isArray(adjacent)) return false;
  return adjacent.some((entry) => typeof entry === "string" && entry === target);
}

function parseStableSelectionRef(value: string): ParsedStableSelectionRef | null {
  const match = value.trim().match(/^(edge|face|solid|surface):(.+)$/i);
  if (!match) return null;
  const kind = (match[1] ?? "").toLowerCase() as Selection["kind"];
  const body = match[2] ?? "";
  const split = body.indexOf("~");
  if (split <= 0) return null;
  const ownerToken = normalizeSelectionToken(body.slice(0, split));
  const remainder = body.slice(split + 1);
  const slotMarker = remainder.indexOf(".");
  if (slotMarker <= 0) return null;
  const createdByToken = normalizeSelectionToken(remainder.slice(0, slotMarker));
  const slot = remainder.slice(slotMarker + 1).trim();
  if (!ownerToken || !createdByToken || !slot) return null;
  return { kind, ownerToken, createdByToken, slot };
}

function parseSelectionSlot(slot: string): ParsedSelectionSlot {
  const trimmed = slot.trim();
  const boundaryMatch = trimmed.match(/^(.*)\.(bound|join)\.(.+)$/);
  if (boundaryMatch) {
    return {
      root: boundaryMatch[1] ?? "",
      relation: boundaryMatch[2] as "bound" | "join",
      target: boundaryMatch[3] ?? "",
    };
  }
  const seamMatch = trimmed.match(/^(.*)\.seam(?:\.part\.\d+)?$/);
  if (seamMatch) {
    return {
      root: seamMatch[1] ?? "",
      relation: "seam",
    };
  }
  const endMatch = trimmed.match(/^(.*)\.end\.(\d+)$/);
  if (endMatch) {
    return {
      root: endMatch[1] ?? "",
      relation: "end",
      index: endMatch[2] ?? "",
    };
  }
  const edgeMatch = trimmed.match(/^(.*)\.edge\.(\d+)$/);
  if (edgeMatch) {
    return {
      root: edgeMatch[1] ?? "",
      relation: "edge",
      index: edgeMatch[2] ?? "",
    };
  }
  return { root: trimmed, relation: "other" };
}

function normalizeSelectionToken(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, ".")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function requireMetaString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseNamedTargetList(name: string): string[] {
  if (!/[,\n;]/.test(name)) return [name];
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const raw of name.split(/[\n,;]+/g)) {
    const token = raw.trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    entries.push(token);
  }
  return entries;
}

function legacyNumericSelectorError(name: string): CompileError | null {
  const match = name.match(/^(face|edge|solid|surface):(\d+)$/i);
  if (!match) return null;

  const selectionKind = match[1]?.toLowerCase() as Selection["kind"] | undefined;
  if (!selectionKind) return null;
  return new CompileError(
    "selector_legacy_numeric_unsupported",
    `Legacy numeric selector ${name} is unsupported`,
    {
      referenceId: name,
      referenceKind: selectionKind,
      migrationHint: "Use a stable selection id emitted in build results or a semantic selector",
    }
  );
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
