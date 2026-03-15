import type {
  KernelSelection,
  KernelSelectionLineage,
  KernelSelectionRecord,
} from "../backend.js";
import { hashValue } from "../hash.js";

export type SelectionLedgerHint = {
  slot?: string;
  role?: string;
  lineage?: KernelSelectionLineage;
  signature?: string;
  provenance?: Record<string, unknown>;
};

export type CollectedSubshape = {
  meta: Record<string, unknown>;
  ledger?: SelectionLedgerHint;
};

export type SelectionIdAssignment = {
  id: string;
  record: KernelSelectionRecord;
};

export type SelectionFingerprintFns = {
  normalizeSelectionToken: (value: string) => string;
  stringFingerprint: (value: unknown) => string | undefined;
  stringArrayFingerprint: (value: unknown) => string[] | undefined;
  numberFingerprint: (value: unknown) => number | undefined;
  vectorFingerprint: (value: unknown) => [number, number, number] | undefined;
};

export function applySelectionLedgerHint(
  entry: CollectedSubshape,
  hint: SelectionLedgerHint
): void {
  const existing = entry.ledger;
  entry.ledger = {
    slot: typeof hint.slot === "string" && hint.slot.length > 0 ? hint.slot : existing?.slot,
    role: typeof hint.role === "string" && hint.role.length > 0 ? hint.role : existing?.role,
    lineage: hint.lineage ?? existing?.lineage,
  };
  if (entry.ledger?.role) {
    if (
      entry.meta.selectionLegacyRole === undefined &&
      typeof entry.meta.role === "string" &&
      entry.meta.role.trim().length > 0
    ) {
      entry.meta.selectionLegacyRole = entry.meta.role;
    }
    entry.meta.role = entry.ledger.role;
  }
  if (entry.ledger?.slot) {
    entry.meta.selectionSlot = entry.ledger.slot;
  }
  if (entry.ledger?.lineage) {
    entry.meta.selectionLineage = entry.ledger.lineage;
  }
  if (typeof hint.signature === "string" && hint.signature.length > 0) {
    entry.meta.selectionSignature = hint.signature;
  }
  if (hint.provenance && typeof hint.provenance === "object") {
    entry.meta.selectionProvenance = { ...hint.provenance };
  }
}

export function assignStableSelectionIds(
  kind: KernelSelection["kind"],
  entries: CollectedSubshape[],
  fns: SelectionFingerprintFns
): SelectionIdAssignment[] {
  type DecoratedEntry = {
    index: number;
    baseId: string;
    tieHash: string;
    record: KernelSelectionRecord;
  };

  const decorated: DecoratedEntry[] = entries.map((entry, index) => {
    const record = buildSelectionRecord(entry, fns);
    return {
      index,
      baseId: buildStableSelectionBaseId(kind, entry.meta, record, fns),
      tieHash: hashValue(selectionTieBreakerFingerprint(kind, entry.meta, fns)),
      record,
    };
  });

  const groups = new Map<string, DecoratedEntry[]>();
  for (const entry of decorated) {
    const bucket = groups.get(entry.baseId);
    if (bucket) bucket.push(entry);
    else groups.set(entry.baseId, [entry]);
  }

  const assignments = new Array<SelectionIdAssignment>(entries.length);
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => {
      const byTie = a.tieHash.localeCompare(b.tieHash);
      if (byTie !== 0) return byTie;
      return a.index - b.index;
    });
    for (let i = 0; i < bucket.length; i += 1) {
      const entry = bucket[i];
      if (!entry) continue;
      const id = bucket.length === 1 ? entry.baseId : `${entry.baseId}.${i + 1}`;
      assignments[entry.index] = {
        id,
        record: entry.record,
      };
    }
  }

  return assignments;
}

export function selectionTieBreakerFingerprint(
  kind: KernelSelection["kind"],
  meta: Record<string, unknown>,
  fns: SelectionFingerprintFns
): Record<string, unknown> {
  return {
    version: 1,
    kind,
    selectionSignature: fns.stringFingerprint(meta.selectionSignature),
    adjacentFaceSlots: fns.stringArrayFingerprint(meta.adjacentFaceSlots),
    center: fns.vectorFingerprint(meta.center),
    centerZ: fns.numberFingerprint(meta.centerZ),
    area: fns.numberFingerprint(meta.area),
    length: fns.numberFingerprint(meta.length),
    radius: fns.numberFingerprint(meta.radius),
    normalVec: fns.vectorFingerprint(meta.normalVec),
    planeOrigin: fns.vectorFingerprint(meta.planeOrigin),
    planeNormal: fns.vectorFingerprint(meta.planeNormal),
    planeXDir: fns.vectorFingerprint(meta.planeXDir),
    planeYDir: fns.vectorFingerprint(meta.planeYDir),
  };
}

function buildSelectionRecord(
  entry: CollectedSubshape,
  fns: SelectionFingerprintFns
): KernelSelectionRecord {
  const identity = selectionIdentityValues(entry.meta);
  return {
    ownerKey: identity.ownerKey,
    createdBy: identity.createdBy,
    role: entry.ledger?.role ?? fns.stringFingerprint(entry.meta.role),
    slot: entry.ledger?.slot,
    lineage: entry.ledger?.lineage ?? { kind: "created" },
  };
}

function selectionIdentityValues(
  meta: Record<string, unknown>,
  record?: Pick<KernelSelectionRecord, "ownerKey" | "createdBy">
): { ownerKey: string; createdBy: string } {
  const ownerKey =
    record?.ownerKey && record.ownerKey.trim().length > 0
      ? record.ownerKey.trim()
      : typeof meta.ownerKey === "string" && meta.ownerKey.trim().length > 0
        ? meta.ownerKey.trim()
        : "unowned";
  const createdBy =
    record?.createdBy && record.createdBy.trim().length > 0
      ? record.createdBy.trim()
      : typeof meta.createdBy === "string" && meta.createdBy.trim().length > 0
        ? meta.createdBy.trim()
        : "unknown";
  return { ownerKey, createdBy };
}

function buildStableSelectionBaseId(
  kind: KernelSelection["kind"],
  meta: Record<string, unknown>,
  record: KernelSelectionRecord,
  fns: SelectionFingerprintFns
): string {
  const { ownerKey, createdBy } = selectionIdentityValues(meta, record);
  const ownerToken = fns.normalizeSelectionToken(ownerKey);
  const createdByToken = fns.normalizeSelectionToken(createdBy);
  const slotToken =
    typeof record.slot === "string" && record.slot.trim().length > 0
      ? fns.normalizeSelectionToken(record.slot)
      : "";
  if (slotToken.length > 0) {
    return `${kind}:${ownerToken}~${createdByToken}.${slotToken}`;
  }
  return buildLegacyStableSelectionBaseId(kind, meta, record, fns);
}

function buildLegacyStableSelectionBaseId(
  kind: KernelSelection["kind"],
  meta: Record<string, unknown>,
  record: KernelSelectionRecord,
  fns: SelectionFingerprintFns
): string {
  const { ownerKey, createdBy } = selectionIdentityValues(meta, record);
  const ownerToken = fns.normalizeSelectionToken(ownerKey);
  const createdByToken = fns.normalizeSelectionToken(createdBy);
  const semanticHash = hashValue(
    selectionSemanticFingerprint(kind, legacySelectionSemanticMeta(meta), fns)
  );
  return `${kind}:${ownerToken}~${createdByToken}.${semanticHash}`;
}

function legacySelectionSemanticMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const legacyMeta = { ...meta };
  if (
    typeof legacyMeta.selectionLegacyRole === "string" &&
    legacyMeta.selectionLegacyRole.trim().length > 0
  ) {
    legacyMeta.role = legacyMeta.selectionLegacyRole;
    return legacyMeta;
  }
  if (typeof legacyMeta.selectionSlot === "string" && legacyMeta.selectionSlot.length > 0) {
    delete legacyMeta.role;
  }
  return legacyMeta;
}

function selectionSemanticFingerprint(
  kind: KernelSelection["kind"],
  meta: Record<string, unknown>,
  fns: SelectionFingerprintFns
): Record<string, unknown> {
  const featureTags = Array.isArray(meta.featureTags)
    ? meta.featureTags
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .slice()
        .sort()
    : [];
  return {
    version: 1,
    kind,
    ownerKey: fns.stringFingerprint(meta.ownerKey),
    createdBy: fns.stringFingerprint(meta.createdBy),
    role: fns.stringFingerprint(meta.role),
    planar: typeof meta.planar === "boolean" ? meta.planar : undefined,
    normal: fns.stringFingerprint(meta.normal),
    surfaceType: fns.stringFingerprint(meta.surfaceType),
    curveType: fns.stringFingerprint(meta.curveType),
    featureTags,
  };
}
