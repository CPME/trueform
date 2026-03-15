import type { KernelSelection } from "./backend.js";
import { describeSemanticEdgeFromAdjacentFaces } from "./selection_semantics.js";

export type SelectionContractIssueCode =
  | "selection_id_duplicate"
  | "selection_alias_metadata_present"
  | "selection_missing_semantic_edge_slot"
  | "selection_hash_only_creator_output";

export type SelectionContractIssueSeverity = "error" | "warn";

export type SelectionContractContext = {
  featureId?: string;
  ownerKey?: string;
};

export type SelectionContractIssue = {
  code: SelectionContractIssueCode;
  severity: SelectionContractIssueSeverity;
  message: string;
  selectionId?: string;
  kind?: KernelSelection["kind"];
  details?: Record<string, unknown>;
};

export function collectSelectionContractIssues(
  selections: KernelSelection[],
  context: SelectionContractContext = {}
): SelectionContractIssue[] {
  const issues: SelectionContractIssue[] = [];
  const seenIds = new Map<string, number>();

  for (let index = 0; index < selections.length; index += 1) {
    const selection = selections[index];
    if (!selection) continue;

    const id = String(selection.id ?? "");
    const previousIndex = seenIds.get(id);
    if (previousIndex !== undefined) {
      issues.push({
        code: "selection_id_duplicate",
        severity: "error",
        message: buildContextMessage(
          context,
          `duplicate selection id ${id} at indexes ${previousIndex} and ${index}`
        ),
        selectionId: id,
        kind: selection.kind,
        details: {
          duplicateIndex: index,
          previousIndex,
        },
      });
    } else {
      seenIds.set(id, index);
    }

    if (selection.meta["selectionAliases"] !== undefined) {
      issues.push({
        code: "selection_alias_metadata_present",
        severity: "error",
        message: buildContextMessage(
          context,
          `selection ${id} still exposes forbidden selectionAliases metadata`
        ),
        selectionId: id,
        kind: selection.kind,
      });
    }

    if (
      selection.kind === "edge" &&
      !hasSemanticSlot(selection) &&
      describeSemanticEdgeFromAdjacentFaces(selection.meta["adjacentFaceSlots"])
    ) {
      const descriptor = describeSemanticEdgeFromAdjacentFaces(
        selection.meta["adjacentFaceSlots"]
      );
      issues.push({
        code: "selection_missing_semantic_edge_slot",
        severity: "error",
        message: buildContextMessage(
          context,
          `edge ${id} is missing a semantic slot even though adjacentFaceSlots can derive ${descriptor?.slot ?? "one"}`
        ),
        selectionId: id,
        kind: selection.kind,
        details: {
          suggestedSlot: descriptor?.slot,
          adjacentFaceSlots: selection.meta["adjacentFaceSlots"],
        },
      });
    }

    if (
      isFeatureCreatedSelection(selection, context.featureId) &&
      (selection.kind === "face" || selection.kind === "edge") &&
      !hasSemanticSlot(selection)
    ) {
      issues.push({
        code: "selection_hash_only_creator_output",
        severity: "warn",
        message: buildContextMessage(
          context,
          `${selection.kind} ${id} is a creator output without a semantic slot; canonical id remains hash-only`
        ),
        selectionId: id,
        kind: selection.kind,
        details: {
          createdBy: selection.meta["createdBy"],
        },
      });
    }
  }

  return issues;
}

export function assertSelectionContractInvariants(
  selections: KernelSelection[],
  context: SelectionContractContext = {}
): void {
  const errors = collectSelectionContractIssues(selections, context).filter(
    (issue) => issue.severity === "error"
  );
  if (errors.length === 0) return;
  throw new Error(formatSelectionContractIssues(errors));
}

export function warnSelectionContractCoverageGaps(
  selections: KernelSelection[],
  context: SelectionContractContext = {},
  options?: {
    enabled?: boolean;
    warn?: (message?: unknown) => void;
  }
): SelectionContractIssue[] {
  const warnings = collectSelectionContractIssues(selections, context).filter(
    (issue) => issue.code === "selection_hash_only_creator_output"
  );
  const enabled = options?.enabled ?? shouldEmitSelectionContractDiagnostics();
  if (!enabled || warnings.length === 0) return warnings;
  const warn = options?.warn ?? console.warn;
  warn(formatSelectionContractIssues(warnings));
  return warnings;
}

export function formatSelectionContractIssues(
  issues: SelectionContractIssue[]
): string {
  const lines = issues.map((issue) => `- ${issue.code}: ${issue.message}`);
  return ["TrueForm selection contract issues detected:", ...lines].join("\n");
}

function buildContextMessage(
  context: SelectionContractContext,
  message: string
): string {
  const prefixParts: string[] = [];
  if (typeof context.featureId === "string" && context.featureId.length > 0) {
    prefixParts.push(`feature ${context.featureId}`);
  }
  if (typeof context.ownerKey === "string" && context.ownerKey.length > 0) {
    prefixParts.push(`owner ${context.ownerKey}`);
  }
  if (prefixParts.length === 0) return message;
  return `${prefixParts.join(", ")}: ${message}`;
}

function hasSemanticSlot(selection: KernelSelection): boolean {
  return (
    typeof selection.meta["selectionSlot"] === "string" &&
    selection.meta["selectionSlot"].trim().length > 0
  );
}

function isFeatureCreatedSelection(
  selection: KernelSelection,
  featureId: string | undefined
): boolean {
  return (
    typeof featureId === "string" &&
    featureId.length > 0 &&
    selection.meta["createdBy"] === featureId
  );
}

function shouldEmitSelectionContractDiagnostics(): boolean {
  return typeof process !== "undefined" && process.env?.TF_SELECTION_DIAGNOSTICS === "1";
}
