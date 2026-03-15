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

export type AdjacentFaceSemanticEdgeDescriptor = {
  slot: string;
  relation: "bound" | "join";
  faceSlots: [string, string];
  baseFaceSlots: [string, string];
  rootSlot: string;
  targetSlot: string;
};

export function describeSemanticEdgeFromAdjacentFaces(
  adjacentFaceSlots: unknown
): AdjacentFaceSemanticEdgeDescriptor | null {
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
    relation,
    faceSlots: [a, b],
    baseFaceSlots: [baseRoot, baseTarget],
    rootSlot,
    targetSlot,
  };
}

export function describeBooleanSemanticEdge(
  adjacentFaceSlots: unknown
): BooleanSemanticEdgeDescriptor | null {
  const descriptor = describeSemanticEdgeFromAdjacentFaces(adjacentFaceSlots);
  if (!descriptor) return null;
  return {
    slot: descriptor.slot,
    signature: `boolean.edge.v1|${descriptor.relation}|${descriptor.rootSlot}|${descriptor.targetSlot}|${descriptor.baseFaceSlots[0]}|${descriptor.baseFaceSlots[1]}`,
    provenance: {
      version: 1,
      relation: descriptor.relation,
      faceSlots: descriptor.faceSlots,
      baseFaceSlots: descriptor.baseFaceSlots,
      rootSlot: descriptor.rootSlot,
      targetSlot: descriptor.targetSlot,
    },
  };
}

export function deriveSemanticEdgeSlotFromAdjacentFaces(adjacentFaceSlots: unknown): string | null {
  return describeSemanticEdgeFromAdjacentFaces(adjacentFaceSlots)?.slot ?? null;
}

export function deriveBooleanSemanticEdgeSlot(adjacentFaceSlots: unknown): string | null {
  return describeBooleanSemanticEdge(adjacentFaceSlots)?.slot ?? null;
}
