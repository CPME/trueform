import type { KernelSelection, KernelSelectionRecord } from "../backend.js";
import {
  assertSelectionContractInvariants,
  warnSelectionContractCoverageGaps,
} from "../selection_contract.js";
import type { CollectedSubshape, SelectionCollectionOptions } from "./operation_contexts.js";
import { describeSemanticEdgeFromAdjacentFaces } from "../selection_semantics.js";

type FaceSelectionBinding = {
  shape: unknown;
  id: string;
  slot?: string;
  role?: string;
};

type SelectionIdAssignment = {
  id: string;
  record: KernelSelectionRecord;
};

type SelectionCollectionDeps = {
  occt: any;
  shapeCenter: (shape: unknown) => [number, number, number];
  applySelectionLedgerHint: (entry: CollectedSubshape, hint: unknown) => void;
  collectUniqueSubshapes: (
    shape: unknown,
    shapeKind: unknown,
    metaFactory: (subshape: unknown) => Record<string, unknown>
  ) => CollectedSubshape[];
  assignStableSelectionIds: (
    kind: KernelSelection["kind"],
    entries: CollectedSubshape[]
  ) => SelectionIdAssignment[];
  faceMetadata: (
    face: unknown,
    owner: unknown,
    featureId: string,
    ownerKey: string,
    featureTags?: string[]
  ) => Record<string, unknown>;
  edgeMetadata: (
    edge: unknown,
    owner: unknown,
    featureId: string,
    ownerKey: string,
    featureTags?: string[]
  ) => Record<string, unknown>;
  annotateEdgeAdjacencyMetadata: (
    shape: unknown,
    edgeEntries: CollectedSubshape[],
    faceBindings: FaceSelectionBinding[]
  ) => void;
};

export function collectSelections(params: {
  shape: unknown;
  featureId: string;
  ownerKey: string;
  featureTags?: string[];
  opts?: SelectionCollectionOptions;
  deps: SelectionCollectionDeps;
}): KernelSelection[] {
  const { shape, featureId, ownerKey, featureTags, opts, deps } = params;
  const selections: KernelSelection[] = [];
  const tags =
    Array.isArray(featureTags) && featureTags.length > 0 ? featureTags.slice() : undefined;

  const rootKind = opts?.rootKind ?? "solid";
  if (rootKind === "solid") {
    const solidEntry: CollectedSubshape = {
      shape,
      meta: {
        shape,
        owner: shape,
        ownerKey,
        createdBy: featureId,
        role: "body",
        center: deps.shapeCenter(shape),
        featureTags: tags,
      },
    };
    deps.applySelectionLedgerHint(solidEntry, {
      slot: "body",
      role: "body",
      lineage: { kind: "created" },
    });
    if (opts?.ledgerPlan?.solid) {
      deps.applySelectionLedgerHint(solidEntry, opts.ledgerPlan.solid);
    }
    const assignment = deps.assignStableSelectionIds("solid", [solidEntry])[0];
    if (assignment) {
      selections.push({
        id: assignment.id,
        kind: "solid",
        meta: solidEntry.meta,
        record: assignment.record,
      });
    }
  }

  const faceEntries = deps.collectUniqueSubshapes(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_FACE,
    (face) => deps.faceMetadata(face, shape, featureId, ownerKey, tags)
  );
  if (opts?.ledgerPlan?.faces) {
    opts.ledgerPlan.faces(faceEntries);
  }
  if (rootKind === "face" && faceEntries.length === 1) {
    const onlyFace = faceEntries[0];
    const existingLedger = onlyFace?.ledger as { slot?: string } | undefined;
    if (onlyFace && !existingLedger?.slot) {
      deps.applySelectionLedgerHint(onlyFace, {
        slot: "seed",
        role: "face",
        lineage: { kind: "created" },
      });
    }
  }
  const faceAssignments = deps.assignStableSelectionIds("face", faceEntries);
  const faceBindings: FaceSelectionBinding[] = [];
  for (let i = 0; i < faceEntries.length; i += 1) {
    const entry = faceEntries[i];
    const assignment = faceAssignments[i];
    if (!entry || !assignment) continue;
    faceBindings.push({
      shape: entry.shape,
      id: assignment.id,
      slot: assignment.record.slot,
      role: assignment.record.role,
    });
    selections.push({
      id: assignment.id,
      kind: "face",
      meta: entry.meta,
      record: assignment.record,
    });
  }

  const edgeEntries = deps.collectUniqueSubshapes(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_EDGE,
    (edge) => deps.edgeMetadata(edge, shape, featureId, ownerKey, tags)
  );
  for (const entry of edgeEntries) {
    if (!entry || !Array.isArray(entry.occurrenceIndices) || entry.occurrenceIndices.length === 0) {
      continue;
    }
    entry.meta["backendEdgeIndices"] = entry.occurrenceIndices.slice();
  }
  deps.annotateEdgeAdjacencyMetadata(shape, edgeEntries, faceBindings);
  if (opts?.ledgerPlan?.edges) {
    opts.ledgerPlan.edges(edgeEntries);
  }
  annotateSemanticEdgeFallbacks(edgeEntries, deps);
  const edgeAssignments = deps.assignStableSelectionIds("edge", edgeEntries);
  for (let i = 0; i < edgeEntries.length; i += 1) {
    const entry = edgeEntries[i];
    const assignment = edgeAssignments[i];
    if (!entry || !assignment) continue;
    selections.push({
      id: assignment.id,
      kind: "edge",
      meta: entry.meta,
      record: assignment.record,
    });
  }

  const contractContext = { featureId, ownerKey };
  assertSelectionContractInvariants(selections, contractContext);
  warnSelectionContractCoverageGaps(selections, contractContext);

  return selections;
}

function annotateSemanticEdgeFallbacks(
  entries: CollectedSubshape[],
  deps: Pick<SelectionCollectionDeps, "applySelectionLedgerHint">
): void {
  for (const entry of entries) {
    if (!entry || entry.ledger?.slot) continue;
    const descriptor = describeSemanticEdgeFromAdjacentFaces(entry.meta["adjacentFaceSlots"]);
    if (!descriptor) continue;
    deps.applySelectionLedgerHint(entry, {
      slot: descriptor.slot,
      role: "edge",
      lineage: { kind: "created" },
    });
  }
}
