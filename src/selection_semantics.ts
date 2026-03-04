function normalizeAdjacentFaceSlots(adjacentFaceSlots: unknown): string[] {
  if (!Array.isArray(adjacentFaceSlots)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const slot of adjacentFaceSlots) {
    if (typeof slot !== "string") continue;
    const trimmed = slot.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function parseSplitBranchSlot(slot: string): { sourceSlot: string; branch: string } | null {
  const match = slot.trim().match(/^split\.(.+)\.branch\.(\d+)$/);
  if (!match) return null;
  const sourceSlot = match[1]?.trim() ?? "";
  const branch = match[2]?.trim() ?? "";
  if (!sourceSlot || !branch) return null;
  return { sourceSlot, branch };
}

function semanticBaseSlot(slot: string): string {
  return parseSplitBranchSlot(slot)?.sourceSlot ?? slot.trim();
}

function isRightSemanticSlot(slot: string): boolean {
  return semanticBaseSlot(slot).startsWith("right.");
}

function isCapSemanticSlot(slot: string): boolean {
  const base = semanticBaseSlot(slot);
  return base === "top" || base === "bottom";
}

function isSideSemanticSlot(slot: string): boolean {
  const base = semanticBaseSlot(slot);
  return /^side\.\d+$/.test(base) || /^right\.side\.\d+$/.test(base);
}

export function deriveBooleanSemanticEdgeSlot(adjacentFaceSlots: unknown): string | null {
  const adjacentSlots = normalizeAdjacentFaceSlots(adjacentFaceSlots);
  if (adjacentSlots.length !== 2) return null;

  const [a, b] = adjacentSlots.slice().sort();
  if (!a || !b) return null;

  if (isRightSemanticSlot(a) && !isRightSemanticSlot(b)) {
    return `${a}.bound.${b}`;
  }
  if (isRightSemanticSlot(b) && !isRightSemanticSlot(a)) {
    return `${b}.bound.${a}`;
  }
  if (isSideSemanticSlot(a) && isCapSemanticSlot(b)) {
    return `${a}.bound.${b}`;
  }
  if (isSideSemanticSlot(b) && isCapSemanticSlot(a)) {
    return `${b}.bound.${a}`;
  }
  return `${a}.join.${b}`;
}
