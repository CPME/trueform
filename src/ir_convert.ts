import type { IntentDocument as DslDocument, IntentPart as DslPart } from "./dsl.js";
import { CompileError } from "./errors.js";
import { TF_IR_SCHEMA, TF_IR_VERSION, type IntentDocument, type IntentPart } from "./ir.js";

export function dslToIrDocument(doc: DslDocument): IntentDocument {
  ensureObject(doc, "validation_document", "Document must be an object");
  ensureNonEmptyString(
    (doc as { id?: unknown }).id,
    "validation_document_id",
    "Document id is required"
  );
  ensureArray(
    (doc as { parts?: unknown }).parts,
    "validation_document_parts",
    "Document parts must be an array"
  );
  return {
    ...doc,
    schema: TF_IR_SCHEMA,
    irVersion: TF_IR_VERSION,
    parts: doc.parts.map(dslToIrPart),
  };
}

export function dslToIrPart(part: DslPart): IntentPart {
  ensureObject(part, "validation_part", "Part must be an object");
  ensureNonEmptyString(
    (part as { id?: unknown }).id,
    "validation_part_id",
    "Part id is required"
  );
  ensureArray(
    (part as { features?: unknown }).features,
    "validation_part_features",
    "Part features must be an array"
  );
  return { ...part };
}

function ensureObject(value: unknown, code: string, message: string): void {
  if (!value || typeof value !== "object") {
    throw new CompileError(code, message);
  }
}

function ensureArray<T>(value: unknown, code: string, message: string): T[] {
  if (!Array.isArray(value)) {
    throw new CompileError(code, message);
  }
  return value as T[];
}

function ensureNonEmptyString(value: unknown, code: string, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CompileError(code, message);
  }
  return value;
}
