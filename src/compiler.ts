import { CompileResult, IntentDocument, IntentPart, Units } from "./ir.js";
import { ParamOverrides } from "./params.js";
import { shouldValidate, validateDocument, type ValidationOptions } from "./ir_validate.js";
import { normalizePart } from "./ir_normalize.js";
import { compilePreparedPart, prepareNormalizedPart, preparePart } from "./part_preparation.js";

export { normalizePart } from "./ir_normalize.js";

export type CompiledPart = {
  partId: string;
  order: string[];
  hashes: Map<string, string>;
};

/** @deprecated Identity helper retained for compatibility. Pass IR directly. */
export function emitIrDocument(doc: IntentDocument): IntentDocument {
  return doc;
}

/** @deprecated Identity helper retained for compatibility. Pass IR directly. */
export function emitIrPart(part: IntentPart): IntentPart {
  return part;
}

export function compileDocument(
  doc: IntentDocument,
  overrides?: Record<string, ParamOverrides>,
  options?: ValidationOptions
): CompileResult[] {
  if (shouldValidate(options)) validateDocument(doc);
  warnPlaceholders(doc);
  return doc.parts.map((part) =>
    compilePart(part, overrides?.[part.id], options, doc.context?.units)
  );
}

export function compilePart(
  part: IntentPart,
  overrides?: ParamOverrides,
  options?: ValidationOptions,
  units?: Units
): CompileResult {
  return compilePreparedPart(preparePart(part, overrides, options, units));
}

export function compilePartWithHashes(
  part: IntentPart,
  options?: ValidationOptions,
  units?: Units
): CompiledPart {
  const prepared = preparePart(part, undefined, options, units);
  return {
    partId: prepared.normalized.id,
    order: prepared.featureOrder,
    hashes: new Map<string, string>(Object.entries(prepared.featureHashes)),
  };
}

export function compileNormalizedPart(part: IntentPart): CompileResult {
  return compilePreparedPart(prepareNormalizedPart(part));
}

function warnPlaceholders(doc: IntentDocument) {
  if (doc.assemblies && doc.assemblies.length > 0) {
    console.warn(
      "TrueForm: AssemblyIR is a data-only placeholder in v1; assemblies are ignored during compile."
    );
  }
  if (doc.constraints && doc.constraints.length > 0) {
    console.warn(
      "TrueForm: FTI constraints are a data-only placeholder in v1; use evaluatePartDimensions for semantic dimensions."
    );
  }
  if (doc.assertions && doc.assertions.length > 0) {
    console.warn(
      "TrueForm: Assertions are data-only in v1; use evaluatePartAssertions to run them."
    );
  }
}
