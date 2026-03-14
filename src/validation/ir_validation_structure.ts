import { CompileError } from "../errors.js";
import { LENGTH_UNITS, isContractValue } from "../ir_contract.js";
import type {
  AssemblyInstance,
  AssemblyMate,
  AssemblyOutput,
  AssemblyRef,
  AxisDirection,
  BuildContext,
  ID,
  IntentAssembly,
  MateConnector,
  ParamDef,
  Predicate,
  RankRule,
  Selector,
  Transform,
  Unit,
} from "../ir.js";
import {
  ensureArray,
  ensureAxis,
  ensureFiniteNumber,
  ensureNonEmptyString,
  ensureObject,
  isParamType,
  validateExpr,
  validatePoint3,
  validateSelector,
} from "./ir_validation_core.js";

export function validateContext(ctx: BuildContext): void {
  ensureObject(ctx, "validation_context", "BuildContext must be an object");
  if (!isContractValue(LENGTH_UNITS, ctx.units as Unit)) {
    throw new CompileError("validation_context_units", `Unsupported units ${String(ctx.units)}`);
  }
  ensureObject(ctx.kernel, "validation_context_kernel", "Kernel config is required");
  ensureNonEmptyString(
    ctx.kernel.name,
    "validation_context_kernel_name",
    "Kernel name is required"
  );
  ensureNonEmptyString(
    ctx.kernel.version,
    "validation_context_kernel_version",
    "Kernel version is required"
  );
  ensureObject(ctx.tolerance, "validation_context_tolerance", "Tolerance config is required");
  ensureFiniteNumber(
    ctx.tolerance.linear,
    "validation_context_tolerance_linear",
    "Tolerance linear must be a number"
  );
  ensureFiniteNumber(
    ctx.tolerance.angular,
    "validation_context_tolerance_angular",
    "Tolerance angular must be a number"
  );
  if (ctx.tolerance.linear < 0 || ctx.tolerance.angular < 0) {
    throw new CompileError(
      "validation_context_tolerance_range",
      "Tolerance values must be non-negative"
    );
  }
}

export function validateAssembly(
  assembly: IntentAssembly,
  partIds: Set<ID>,
  connectorIdsByPart: Map<ID, Set<ID>>
): void {
  ensureObject(assembly, "validation_assembly", "Assembly must be an object");
  ensureNonEmptyString(assembly.id, "validation_assembly_id", "Assembly id is required");

  const instanceIds = new Set<ID>();
  const instanceToPart = new Map<ID, ID>();
  const instances = ensureArray<AssemblyInstance>(
    assembly.instances,
    "validation_assembly_instances",
    "Assembly instances must be an array"
  );
  for (const instance of instances) {
    const id = ensureNonEmptyString(
      instance?.id,
      "validation_assembly_instance_id",
      "Assembly instance id is required"
    );
    if (instanceIds.has(id)) {
      throw new CompileError(
        "validation_assembly_instance_duplicate",
        `Duplicate assembly instance id ${id}`
      );
    }
    instanceIds.add(id);
    ensureNonEmptyString(
      instance.part,
      "validation_assembly_instance_part",
      "Assembly instance part is required"
    );
    if (!partIds.has(instance.part)) {
      throw new CompileError(
        "validation_assembly_instance_part_missing",
        `Assembly instance ${instance.id} references missing part ${instance.part}`
      );
    }
    instanceToPart.set(id, instance.part);
    if (instance.transform !== undefined) validateTransform(instance.transform);
    if (instance.tags !== undefined) {
      const tags = ensureArray<string>(
        instance.tags,
        "validation_assembly_instance_tags",
        "Assembly instance tags must be an array"
      );
      for (const tag of tags) {
        ensureNonEmptyString(tag, "validation_assembly_instance_tag", "Assembly instance tag must be a string");
      }
    }
  }

  if (assembly.mates !== undefined) {
    const mates = ensureArray<AssemblyMate>(
      assembly.mates,
      "validation_assembly_mates",
      "Assembly mates must be an array"
    );
    for (const mate of mates) {
      validateAssemblyMate(mate, instanceIds, instanceToPart, connectorIdsByPart);
    }
  }

  if (assembly.outputs !== undefined) {
    const outputs = ensureArray<AssemblyOutput>(
      assembly.outputs,
      "validation_assembly_outputs",
      "Assembly outputs must be an array"
    );
    for (const output of outputs) {
      ensureNonEmptyString(
        output?.name,
        "validation_assembly_output_name",
        "Assembly output name is required"
      );
      const refs = ensureArray<AssemblyRef>(
        output.refs,
        "validation_assembly_output_refs",
        "Assembly output refs must be an array"
      );
      for (const ref of refs) {
        validateAssemblyRef(ref, instanceIds, instanceToPart, connectorIdsByPart);
      }
    }
  }
}

export function validateAssemblyRef(
  ref: unknown,
  instanceIds: Set<ID>,
  instanceToPart: Map<ID, ID>,
  connectorIdsByPart: Map<ID, Set<ID>>
): void {
  ensureObject(ref, "validation_assembly_ref", "Assembly ref must be an object");
  const instance = ensureNonEmptyString(
    (ref as { instance?: ID }).instance,
    "validation_assembly_ref_instance",
    "Assembly ref instance is required"
  );
  if (!instanceIds.has(instance)) {
    throw new CompileError(
      "validation_assembly_ref_instance_missing",
      `Assembly ref references missing instance ${instance}`
    );
  }
  const connector = ensureNonEmptyString(
    (ref as { connector?: ID }).connector,
    "validation_assembly_ref_connector",
    "Assembly ref connector is required"
  );
  const partId = instanceToPart.get(instance);
  if (!partId) {
    throw new CompileError(
      "validation_assembly_ref_instance_missing",
      `Assembly ref references missing instance ${instance}`
    );
  }
  const connectors = connectorIdsByPart.get(partId);
  if (!connectors || !connectors.has(connector)) {
    throw new CompileError(
      "validation_assembly_ref_connector_missing",
      `Assembly ref connector ${connector} not found on part ${partId}`
    );
  }
}

export function validateConnector(connector: MateConnector): void {
  ensureObject(connector, "validation_connector", "Connector must be an object");
  ensureNonEmptyString(connector.id, "validation_connector_id", "Connector id is required");
  validateSelector(connector.origin);
  if (!selectorAnchored(connector.origin)) {
    throw new CompileError(
      "validation_connector_anchor",
      `Connector ${connector.id} origin selector must be anchored`
    );
  }
  if (connector.normal !== undefined) ensureAxis(connector.normal, "Connector normal is invalid");
  if (connector.xAxis !== undefined) ensureAxis(connector.xAxis, "Connector xAxis is invalid");
}

export function validateTransform(transform: Transform): void {
  ensureObject(transform, "validation_transform", "Transform must be an object");
  if (transform.matrix !== undefined && (transform.translation || transform.rotation)) {
    throw new CompileError(
      "validation_transform_conflict",
      "Transform matrix cannot be combined with translation or rotation"
    );
  }
  if (transform.translation !== undefined) {
    validatePoint3(
      transform.translation,
      "validation_transform_translation",
      "Transform translation must be a 3D vector"
    );
  }
  if (transform.rotation !== undefined) {
    validatePoint3(
      transform.rotation,
      "validation_transform_rotation",
      "Transform rotation must be a 3D vector"
    );
  }
  if (transform.matrix !== undefined) {
    const matrix = ensureArray<number>(
      transform.matrix,
      "validation_transform_matrix",
      "Transform matrix must be an array"
    );
    if (matrix.length !== 16) {
      throw new CompileError(
        "validation_transform_matrix_length",
        "Transform matrix must be length 16"
      );
    }
    for (const value of matrix) {
      ensureFiniteNumber(
        value,
        "validation_transform_matrix_value",
        "Transform matrix entries must be numbers"
      );
    }
  }
}

export function validateParam(param: ParamDef): void {
  ensureObject(param, "validation_param", "Param must be an object");
  ensureNonEmptyString(param.id, "validation_param_id", "Param id is required");
  if (!isParamType(param.type)) {
    throw new CompileError("validation_param_type", `Unknown param type ${String(param.type)}`);
  }
  validateExpr(param.value, "Param value");
}

export function selectorAnchored(selector: Selector): boolean {
  if (selector.kind === "selector.named") return true;
  for (const predicate of selector.predicates as Predicate[]) {
    if (predicate.kind === "pred.createdBy") return true;
  }
  for (const rule of selector.rank as RankRule[]) {
    if (rule.kind !== "rank.closestTo") continue;
    if (selectorAnchored(rule.target)) return true;
  }
  return false;
}

function validateAssemblyMate(
  mate: AssemblyMate,
  instanceIds: Set<ID>,
  instanceToPart: Map<ID, ID>,
  connectorIdsByPart: Map<ID, Set<ID>>
): void {
  ensureObject(mate, "validation_assembly_mate", "Mate must be an object");
  const kind = (mate as { kind?: string }).kind;
  const validateMateRefs = () => {
    validateAssemblyRef((mate as { a: unknown }).a, instanceIds, instanceToPart, connectorIdsByPart);
    validateAssemblyRef((mate as { b: unknown }).b, instanceIds, instanceToPart, connectorIdsByPart);
  };
  const validateOptionalNumber = (value: unknown, code: string, message: string) => {
    if (value === undefined) return;
    ensureFiniteNumber(value as number, code, message);
  };
  if (
    kind === "mate.fixed" ||
    kind === "mate.coaxial" ||
    kind === "mate.parallel" ||
    kind === "mate.perpendicular" ||
    kind === "mate.slider"
  ) {
    validateMateRefs();
    return;
  }
  if (kind === "mate.planar" || kind === "mate.insert" || kind === "mate.hinge") {
    validateMateRefs();
    validateOptionalNumber(
      (mate as { offset?: unknown }).offset,
      "validation_assembly_mate_offset",
      "Mate offset must be a number"
    );
    return;
  }
  if (kind === "mate.distance") {
    validateMateRefs();
    const distance = (mate as { distance?: unknown }).distance;
    validateOptionalNumber(
      distance,
      "validation_assembly_mate_distance",
      "Mate distance must be a number"
    );
    if (typeof distance === "number" && distance < 0) {
      throw new CompileError(
        "validation_assembly_mate_distance_range",
        "Mate distance must be non-negative"
      );
    }
    return;
  }
  if (kind === "mate.angle") {
    validateMateRefs();
    validateOptionalNumber(
      (mate as { angle?: unknown }).angle,
      "validation_assembly_mate_angle",
      "Mate angle must be a number"
    );
    return;
  }
  throw new CompileError("validation_assembly_mate_kind", `Unknown mate kind ${String(kind)}`);
}
