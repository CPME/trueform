import {
  FaceQuery,
  RankRule,
  Selector,
  ID,
  NamedOutput,
  Predicate,
} from "./ir.js";
import { CompileError } from "./errors.js";
import { parseSplitBranchSlot, semanticBaseSlot } from "./selection_slots.js";

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

  const rebound = resolveStableSelectionRebind(normalized, ctx);
  if (rebound) return { selection: rebound };

  const legacyError = legacyNumericSelectorError(normalized);
  if (legacyError) return { selection: null, error: legacyError };
  return { selection: null };
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

type BooleanEdgeRebindMetadata = {
  relation: "bound" | "join";
  rootSlot: string;
  targetSlot: string;
  baseRootSlot: string;
  baseTargetSlot: string;
};

function resolveStableSelectionRebind(
  target: string,
  ctx: ResolutionContext
): Selection | null {
  const parsed = parseStableSelectionRef(target);
  if (!parsed) return null;
  const parsedSlot = parseSelectionSlot(parsed.slot);
  if (parsedSlot.relation === "edge") return null;

  const ownerScoped = stableSelectionRebindCandidates(parsed, ctx, true);
  if (ownerScoped.length > 0) {
    return pickStableSelectionRebindCandidate(parsed, parsedSlot, ownerScoped);
  }

  const producerScoped = stableSelectionRebindCandidates(parsed, ctx, false);
  if (producerScoped.length === 0) return null;
  return pickStableSelectionRebindCandidate(parsed, parsedSlot, producerScoped);
}

function stableSelectionRebindCandidates(
  parsed: ParsedStableSelectionRef,
  ctx: ResolutionContext,
  matchOwner: boolean
): Selection[] {
  return ctx.selections.filter((selection) => {
    if (selection.kind !== parsed.kind) return false;
    const createdBy = normalizeSelectionToken(requireMetaString(selection.meta["createdBy"]));
    if (createdBy !== parsed.createdByToken) return false;
    if (!matchOwner) return true;
    const owner = normalizeSelectionToken(requireMetaString(selection.meta["ownerKey"]));
    return owner === parsed.ownerToken;
  });
}

function pickStableSelectionRebindCandidate(
  parsed: ParsedStableSelectionRef,
  parsedSlot: ParsedSelectionSlot,
  candidates: Selection[]
): Selection | null {
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
  const lineageScore = scoreLineageSelectionRebind(parsed.slot, selection, candidateSlot);
  const booleanEdgeMetadataScore = scoreBooleanEdgeMetadataRebind(parsedSlot, selection);

  const candidateParsed = parseSelectionSlot(candidateSlot);

  if (parsedSlot.relation === "bound" || parsedSlot.relation === "join") {
    if (
      candidateParsed.relation === "other" ||
      candidateParsed.relation === "edge"
    ) {
      return Math.max(lineageScore, booleanEdgeMetadataScore);
    }
    if (candidateParsed.relation === parsedSlot.relation && "target" in candidateParsed) {
      const rootScore = scoreSlotMigration(parsedSlot.root, candidateParsed.root);
      if (rootScore <= 0) return 0;
      const targetScore = scoreSlotMigration(parsedSlot.target, candidateParsed.target);
      if (targetScore <= 0) return 0;
      return Math.max(
        88 + Math.min(rootScore, targetScore),
        booleanEdgeMetadataScore
      );
    }
    if (
      candidateParsed.relation !== "bound" &&
      candidateParsed.relation !== "join"
    ) {
      return Math.max(lineageScore, booleanEdgeMetadataScore);
    }
    const label = parsedSlot.root.split(".")[0] ?? "";
    const target = parsedSlot.target;
    const targetLooksDerived = label.length > 0 && target.startsWith(`${label}.`);
    if (
      parsedSlot.relation === "bound" &&
      targetLooksDerived &&
      candidateParsed.relation === "join" &&
      "target" in candidateParsed &&
      scoreSlotMigration(target, candidateParsed.target) > 0 &&
      candidateHasAdjacentFaceSlot(selection, target)
    ) {
      return Math.max(90, booleanEdgeMetadataScore);
    }
    if (
      parsedSlot.relation === "join" &&
      candidateParsed.relation === "bound" &&
      "target" in candidateParsed &&
      scoreSlotMigration(target, candidateParsed.target) > 0 &&
      candidateHasAdjacentFaceSlot(selection, target)
    ) {
      return Math.max(70, booleanEdgeMetadataScore);
    }
    return Math.max(lineageScore, booleanEdgeMetadataScore);
  }

  if (parsedSlot.relation === "seam") {
    return candidateParsed.relation === "seam" &&
      scoreSlotMigration(parsedSlot.root, candidateParsed.root) > 0
      ? 85
      : 0;
  }

  if (parsedSlot.relation === "end") {
    return candidateParsed.relation === "end" &&
      candidateParsed.index === parsedSlot.index &&
      scoreSlotMigration(parsedSlot.root, candidateParsed.root) > 0
      ? 85
      : 0;
  }

  return lineageScore;
}

function scoreBooleanEdgeMetadataRebind(
  parsedSlot: ParsedSelectionSlot,
  selection: Selection
): number {
  if (parsedSlot.relation !== "bound" && parsedSlot.relation !== "join") {
    return 0;
  }
  const metadata = selectionBooleanEdgeRebindMetadata(selection);
  if (!metadata) return 0;

  const expectedSignature = buildBooleanEdgeSelectionSignature(parsedSlot);
  const candidateSignature =
    typeof selection.meta["selectionSignature"] === "string"
      ? selection.meta["selectionSignature"].trim()
      : "";
  if (candidateSignature && candidateSignature === expectedSignature) {
    return 96;
  }

  if (metadata.relation !== parsedSlot.relation) return 0;

  const exactRootScore = scoreSlotMigration(parsedSlot.root, metadata.rootSlot);
  const exactTargetScore = scoreSlotMigration(parsedSlot.target, metadata.targetSlot);
  if (exactRootScore > 0 && exactTargetScore > 0) {
    return 86 + Math.min(exactRootScore, exactTargetScore);
  }

  const baseRootScore = scoreSlotMigration(parsedSlot.root, metadata.baseRootSlot);
  const baseTargetScore = scoreSlotMigration(parsedSlot.target, metadata.baseTargetSlot);
  if (baseRootScore > 0 && baseTargetScore > 0) {
    return 76 + Math.min(baseRootScore, baseTargetScore);
  }

  return 0;
}

function selectionBooleanEdgeRebindMetadata(
  selection: Selection
): BooleanEdgeRebindMetadata | null {
  return (
    parseBooleanEdgeSelectionProvenance(selection.meta["selectionProvenance"]) ??
    parseBooleanEdgeSelectionSignature(selection.meta["selectionSignature"])
  );
}

function parseBooleanEdgeSelectionProvenance(value: unknown): BooleanEdgeRebindMetadata | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const relation = record["relation"];
  if (relation !== "bound" && relation !== "join") return null;
  const rootSlot = requireNonEmptyString(record["rootSlot"]);
  const targetSlot = requireNonEmptyString(record["targetSlot"]);
  const baseFaceSlots = record["baseFaceSlots"];
  if (!rootSlot || !targetSlot || !Array.isArray(baseFaceSlots) || baseFaceSlots.length !== 2) {
    return null;
  }
  const baseRootSlot = requireNonEmptyString(baseFaceSlots[0]);
  const baseTargetSlot = requireNonEmptyString(baseFaceSlots[1]);
  if (!baseRootSlot || !baseTargetSlot) return null;
  return {
    relation,
    rootSlot,
    targetSlot,
    baseRootSlot,
    baseTargetSlot,
  };
}

function parseBooleanEdgeSelectionSignature(value: unknown): BooleanEdgeRebindMetadata | null {
  if (typeof value !== "string") return null;
  const parts = value.trim().split("|");
  if (parts.length !== 6 || parts[0] !== "boolean.edge.v1") return null;
  const relation = parts[1];
  const rootSlot = parts[2];
  const targetSlot = parts[3];
  const baseRootSlot = parts[4];
  const baseTargetSlot = parts[5];
  if (
    (relation !== "bound" && relation !== "join") ||
    !rootSlot ||
    !targetSlot ||
    !baseRootSlot ||
    !baseTargetSlot
  ) {
    return null;
  }
  return {
    relation,
    rootSlot,
    targetSlot,
    baseRootSlot,
    baseTargetSlot,
  };
}

function buildBooleanEdgeSelectionSignature(
  parsedSlot: Extract<ParsedSelectionSlot, { relation: "bound" | "join" }>
): string {
  return [
    "boolean.edge.v1",
    parsedSlot.relation,
    parsedSlot.root,
    parsedSlot.target,
    semanticBaseSlot(parsedSlot.root),
    semanticBaseSlot(parsedSlot.target),
  ].join("|");
}

function scoreLineageSelectionRebind(
  parsedSlot: string,
  selection: Selection,
  candidateSlot: string
): number {
  const lineageSourceSlot = selectionLineageSourceSlot(selection);
  if (!lineageSourceSlot) return 0;

  const parsedSplit = parseSplitBranchSlot(parsedSlot);
  const candidateSplit = parseSplitBranchSlot(candidateSlot);
  if (parsedSplit && candidateSplit) {
    return parsedSplit.sourceSlot === candidateSplit.sourceSlot &&
      parsedSplit.branch === candidateSplit.branch
      ? 84
      : 0;
  }
  if (
    !parsedSplit &&
    candidateSplit &&
    candidateSplit.sourceSlot === parsedSlot &&
    lineageSourceSlot === parsedSlot
  ) {
    return 74;
  }
  if (
    parsedSplit &&
    !candidateSplit &&
    candidateSlot === parsedSplit.sourceSlot &&
    lineageSourceSlot === parsedSplit.sourceSlot
  ) {
    return 72;
  }

  const parsedDuplicate = parseLegacyDuplicateSlot(parsedSlot);
  if (!parsedDuplicate) return 0;
  if (parsedDuplicate.baseSlot !== lineageSourceSlot) return 0;
  if (parsedDuplicate.index === "1" && candidateSlot === parsedDuplicate.baseSlot) {
    return 70;
  }
  if (
    parsedDuplicate.index === "2" &&
    candidateSlot === `right.${parsedDuplicate.baseSlot}`
  ) {
    return 68;
  }
  return 0;
}

function scoreSlotMigration(parsedSlot: string, candidateSlot: string): number {
  if (parsedSlot === candidateSlot) return 10;

  const parsedSplit = parseSplitBranchSlot(parsedSlot);
  const candidateSplit = parseSplitBranchSlot(candidateSlot);
  if (parsedSplit && candidateSplit) {
    return parsedSplit.sourceSlot === candidateSplit.sourceSlot &&
      parsedSplit.branch === candidateSplit.branch
      ? 8
      : 0;
  }
  if (!parsedSplit && candidateSplit && candidateSplit.sourceSlot === parsedSlot) {
    return 6;
  }
  if (parsedSplit && !candidateSplit && candidateSlot === parsedSplit.sourceSlot) {
    return 5;
  }

  const parsedDuplicate = parseLegacyDuplicateSlot(parsedSlot);
  if (!parsedDuplicate) return 0;
  if (parsedDuplicate.index === "1" && candidateSlot === parsedDuplicate.baseSlot) {
    return 4;
  }
  if (parsedDuplicate.index === "2" && candidateSlot === `right.${parsedDuplicate.baseSlot}`) {
    return 3;
  }
  return 0;
}

function selectionLineageSourceSlot(selection: Selection): string | null {
  const lineage = selection.meta["selectionLineage"];
  if (!lineage || typeof lineage !== "object") return null;
  const from = (lineage as Record<string, unknown>)["from"];
  if (typeof from !== "string" || from.trim().length === 0) return null;
  const parsed = parseStableSelectionRef(from);
  return parsed?.slot ?? null;
}

function parseLegacyDuplicateSlot(
  slot: string
): { baseSlot: string; index: string } | null {
  const trimmed = slot.trim();
  if (
    trimmed.includes(".branch.") ||
    trimmed.includes(".part.") ||
    trimmed.includes(".bound.") ||
    trimmed.includes(".join.") ||
    trimmed.includes(".seam") ||
    trimmed.includes(".end.") ||
    trimmed.includes(".edge.")
  ) {
    return null;
  }
  const match = trimmed.match(/^(.*)\.(\d+)$/);
  if (!match) return null;
  const baseSlot = match[1]?.trim() ?? "";
  const index = match[2]?.trim() ?? "";
  if (!baseSlot || !index) return null;
  return { baseSlot, index };
}

function candidateHasAdjacentFaceSlot(selection: Selection, target: string): boolean {
  const adjacent = selection.meta["adjacentFaceSlots"];
  if (!Array.isArray(adjacent)) return false;
  return adjacent.some(
    (entry) => typeof entry === "string" && scoreSlotMigration(target, entry) > 0
  );
}

function requireNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
