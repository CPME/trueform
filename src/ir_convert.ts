import type { IntentDocument, IntentPart } from "./ir.js";

/** @deprecated IR is canonical; this helper is now an identity pass-through. */
export function dslToIrDocument(doc: IntentDocument): IntentDocument {
  return doc;
}

/** @deprecated IR is canonical; this helper is now an identity pass-through. */
export function dslToIrPart(part: IntentPart): IntentPart {
  return part;
}
