export type SplitBranchSlot = {
  sourceSlot: string;
  branch: string;
};

export function parseSplitBranchSlot(slot: string): SplitBranchSlot | null {
  const match = slot.trim().match(/^split\.(.+)\.branch\.(\d+)$/);
  if (!match) return null;
  const sourceSlot = match[1]?.trim() ?? "";
  const branch = match[2]?.trim() ?? "";
  if (!sourceSlot || !branch) return null;
  return { sourceSlot, branch };
}

export function semanticBaseSlot(slot: string): string {
  return parseSplitBranchSlot(slot)?.sourceSlot ?? slot.trim();
}
