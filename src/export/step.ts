import type {
  Backend,
  BackendAsync,
  KernelObject,
  StepExportOptions,
} from "../backend.js";
import type { BuildContext, IntentPart } from "../ir.js";
import { buildPmiPayload } from "../pmi.js";

export type StepWithPmiResult = {
  step: Uint8Array;
  pmi?: string;
};

export type StepWithPmiAsyncResult = StepWithPmiResult & {
  embedded?: boolean;
};

export type StepWithPmiOptions = StepExportOptions & {
  requirePmi?: boolean;
  context?: BuildContext;
};

export function exportStepAp242WithPmi(
  backend: Backend,
  target: KernelObject,
  part: IntentPart,
  opts: StepWithPmiOptions = {}
): StepWithPmiResult {
  const schema = opts.schema ?? "AP242";
  if (schema !== "AP242") {
    throw new Error("STEP PMI export requires AP242 schema");
  }
  const step = backend.exportStep(target, { ...opts, schema: "AP242" });
  const constraints = part.constraints ?? [];
  if (constraints.length === 0) {
    if (opts.requirePmi) {
      throw new Error("STEP PMI export: no constraints available on part");
    }
    return { step };
  }
  const pmiPayload = buildPmiPayload(part, opts.context);
  return {
    step,
    pmi: JSON.stringify(pmiPayload),
  };
}

export async function exportStepAp242WithPmiAsync(
  backend: BackendAsync,
  target: KernelObject,
  part: IntentPart,
  opts: StepWithPmiOptions = {}
): Promise<StepWithPmiAsyncResult> {
  const schema = opts.schema ?? "AP242";
  if (schema !== "AP242") {
    throw new Error("STEP PMI export requires AP242 schema");
  }
  const constraints = part.constraints ?? [];
  if (constraints.length === 0) {
    if (opts.requirePmi) {
      throw new Error("STEP PMI export: no constraints available on part");
    }
    const step = await backend.exportStep(target, { ...opts, schema: "AP242" });
    return { step };
  }

  const pmiPayload = buildPmiPayload(part, opts.context);
  if (typeof backend.exportStepWithPmi === "function") {
    const step = await backend.exportStepWithPmi(target, pmiPayload, {
      ...opts,
      schema: "AP242",
    });
    return { step, embedded: true };
  }

  const step = await backend.exportStep(target, { ...opts, schema: "AP242" });
  return {
    step,
    pmi: JSON.stringify(pmiPayload),
    embedded: false,
  };
}
