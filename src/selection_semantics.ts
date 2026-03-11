import { semanticBaseSlot } from "./selection_slots.js";

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

export type BooleanSemanticEdgeDescriptor = {
  slot: string;
  signature: string;
  provenance: {
    version: 1;
    relation: "bound" | "join";
    faceSlots: [string, string];
    baseFaceSlots: [string, string];
    rootSlot: string;
    targetSlot: string;
  };
};

export function describeBooleanSemanticEdge(
  adjacentFaceSlots: unknown
): BooleanSemanticEdgeDescriptor | null {
  const adjacentSlots = normalizeAdjacentFaceSlots(adjacentFaceSlots);
  if (adjacentSlots.length !== 2) return null;

  const [a, b] = adjacentSlots.slice().sort();
  if (!a || !b) return null;

  let rootSlot: string;
  let targetSlot: string;
  let relation: "bound" | "join";

  if (isRightSemanticSlot(a) && !isRightSemanticSlot(b)) {
    rootSlot = a;
    targetSlot = b;
    relation = "bound";
  } else if (isRightSemanticSlot(b) && !isRightSemanticSlot(a)) {
    rootSlot = b;
    targetSlot = a;
    relation = "bound";
  } else if (isSideSemanticSlot(a) && isCapSemanticSlot(b)) {
    rootSlot = a;
    targetSlot = b;
    relation = "bound";
  } else if (isSideSemanticSlot(b) && isCapSemanticSlot(a)) {
    rootSlot = b;
    targetSlot = a;
    relation = "bound";
  } else {
    rootSlot = a;
    targetSlot = b;
    relation = "join";
  }

  const baseRoot = semanticBaseSlot(rootSlot);
  const baseTarget = semanticBaseSlot(targetSlot);
  return {
    slot: `${rootSlot}.${relation}.${targetSlot}`,
    signature: `boolean.edge.v1|${relation}|${rootSlot}|${targetSlot}|${baseRoot}|${baseTarget}`,
    provenance: {
      version: 1,
      relation,
      faceSlots: [a, b],
      baseFaceSlots: [baseRoot, baseTarget],
      rootSlot,
      targetSlot,
    },
  };
}

export function deriveBooleanSemanticEdgeSlot(adjacentFaceSlots: unknown): string | null {
  return describeBooleanSemanticEdge(adjacentFaceSlots)?.slot ?? null;
}
