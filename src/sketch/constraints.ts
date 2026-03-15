import { CompileError } from "../errors.js";
import type { SketchConstraint, SketchEntity } from "../ir.js";
import {
  add,
  addLevenbergRegularization,
  angleBetween,
  angleDirections,
  applyVariableStep,
  buildNormalGradient,
  buildNormalMatrix,
  chooseAlignedDirection,
  chooseClosestDirection,
  clampVectorToTrustRadius,
  computeQuadraticModelReduction,
  cross,
  dedupeEntityIds,
  degToRad,
  distance,
  dot,
  estimateMatrixRank,
  estimateRigidBodyModes,
  estimateVariableScales,
  fallbackGradientStep,
  lineDirection,
  matrixVectorNorm,
  maxAbsValue,
  normalize,
  perpendicularDirections,
  quadraticForm,
  readAngleConstraint,
  readNumericPoint,
  readPositiveRadius,
  restoreVariableValues,
  samePointRef,
  scale,
  scaleJacobianColumns,
  scaleVector,
  solveLinearSystem,
  subtract,
  targetLineLength,
  toFiniteNumber,
  unscaleVariableStep,
  vectorDot,
  vectorLength,
  vectorNorm,
} from "./solver_math.js";
import {
  analyzeDegreesOfFreedom as analyzeSketchDegreesOfFreedom,
  buildConstraintComponents as buildSketchConstraintComponents,
  buildConstraintJacobian as buildSketchConstraintJacobian,
  buildConstraintResidualRowRanges as buildSketchConstraintResidualRowRanges,
  buildConstraintResidualVector as buildSketchConstraintResidualVector,
  buildConstraintStatus as buildSketchConstraintStatus,
  buildSolveReport as buildSketchSolveReport,
  buildComponentStatus as buildSketchComponentStatus,
  ensureUniqueConstraintIds as ensureUniqueSketchConstraintIds,
  type SolverAnalysisDeps,
} from "./solver_analysis.js";
import {
  preferredCurveSeparation,
  projectCurveToCurveTangency,
  projectCurveToLineTangency,
  projectLineToCurveTangency,
  resolveConcentricCurve,
  resolveLine,
  resolveRadiusTarget,
  tryResolveLine,
  tryResolveTangentCurve,
  type NumericPoint,
  type NumericVector,
} from "./solver_geometry.js";
import {
  collectDrivenVariables,
  collectScalarVariables,
  resolvePointRef,
  type ScalarVariable,
} from "./solver_variables.js";

export type SketchConstraintSolveStatus =
  | "fully-constrained"
  | "underconstrained"
  | "overconstrained"
  | "conflict"
  | "ambiguous";

export type SketchConstraintComponentSolveStatus =
  | SketchConstraintSolveStatus
  | "component-constrained";

export type SketchConstraintDiagnosticStatus = "satisfied" | "unsatisfied";
export type SketchConstraintSource = "authored" | "transient";
export type SketchConstraintDiagnosticType = "conflict" | "redundant";

export type SketchConstraintMotionHandleDelta =
  | {
      entityId: string;
      handle: string;
      kind: "point";
      delta: [number, number];
      magnitude: number;
    }
  | {
      entityId: string;
      handle: string;
      kind: "scalar";
      delta: number;
      magnitude: number;
    };

export type SketchConstraintMotionDirection = {
  directionId: string;
  classification: "rigid-body" | "internal";
  magnitude: number;
  entityIds: string[];
  handles: SketchConstraintMotionHandleDelta[];
};

export type SketchConstraintSolveOptions = {
  transientConstraints?: SketchConstraint[];
  warmStartEntities?: SketchEntity[];
  changedEntityIds?: string[];
  changedConstraintIds?: string[];
  maxIterations?: number;
  maxTimeMs?: number;
  signal?: AbortSignal;
};

export type SketchConstraintSolveTermination =
  | "converged"
  | "not-run"
  | "max-iterations"
  | "time-budget"
  | "aborted";

export type SketchConstraintStatus = {
  constraintId: string;
  kind: SketchConstraint["kind"];
  source: SketchConstraintSource;
  status: SketchConstraintDiagnosticStatus;
  residual: number;
  entityIds: string[];
  diagnosticType?: SketchConstraintDiagnosticType;
  relatedConstraintIds?: string[];
  code?: string;
  message?: string;
};

export type SketchConstraintEntityStatus = {
  entityId: string;
  componentId: string;
  totalDegreesOfFreedom: number;
  remainingDegreesOfFreedom: number;
  grounded: boolean;
  rigidBodyDegreesOfFreedom: number;
  componentStatus: SketchConstraintComponentSolveStatus;
  status: SketchConstraintSolveStatus;
};

export type SketchConstraintComponentStatus = {
  componentId: string;
  entityIds: string[];
  constraintIds: string[];
  totalDegreesOfFreedom: number;
  remainingDegreesOfFreedom: number;
  internalRemainingDegreesOfFreedom: number;
  rigidBodyDegreesOfFreedom: number;
  grounded: boolean;
  status: SketchConstraintComponentSolveStatus;
  freeMotionDirections: SketchConstraintMotionDirection[];
};

export type SketchConstraintSolveReport = {
  entities: SketchEntity[];
  totalDegreesOfFreedom: number;
  remainingDegreesOfFreedom: number;
  status: SketchConstraintSolveStatus;
  componentStatus: SketchConstraintComponentStatus[];
  entityStatus: SketchConstraintEntityStatus[];
  constraintStatus: SketchConstraintStatus[];
  solveMeta: {
    termination: SketchConstraintSolveTermination;
    iterations: number;
    elapsedMs: number;
    maxResidual: number;
    solvedComponentIds: string[];
    skippedComponentIds: string[];
  };
};

export type SketchConstraintSessionSolveInput = {
  entities: SketchEntity[];
  transientConstraints?: SketchConstraint[];
  changedEntityIds?: string[];
  changedConstraintIds?: string[];
  maxIterations?: number;
  maxTimeMs?: number;
  signal?: AbortSignal;
};

export type SketchConstraintSolveSession = {
  solve: (input: SketchConstraintSessionSolveInput) => SketchConstraintSolveReport;
  solveAsync: (input: SketchConstraintSessionSolveInput) => Promise<SketchConstraintSolveReport>;
  reset: () => void;
};

type SketchConstraintComponent = {
  componentId: string;
  entityIds: string[];
  constraintIds: string[];
};

type SketchConstraintComponentAnalysis = {
  componentId: string;
  totalDegreesOfFreedom: number;
  remainingDegreesOfFreedom: number;
  internalRemainingDegreesOfFreedom: number;
  rigidBodyDegreesOfFreedom: number;
  grounded: boolean;
  redundantEquations: number;
  freeMotionDirections: SketchConstraintMotionDirection[];
};

type SketchConstraintSolveAnalysis = {
  remainingDegreesOfFreedom: number;
  internalRemainingDegreesOfFreedom: number;
  redundantEquations: number;
  perEntityRemaining: Map<string, number>;
  componentAnalysis: Map<string, SketchConstraintComponentAnalysis>;
  entityToComponent: Map<string, string>;
};

type SketchSolveExecutionState = {
  startMs: number;
  deadlineMs: number | null;
  iterationBudget: number;
  iterations: number;
  signal?: AbortSignal;
  termination: Exclude<SketchConstraintSolveTermination, "converged" | "not-run"> | null;
  solvedComponentIds: string[];
  skippedComponentIds: string[];
};

const SOLVE_EPSILON = 1e-9;
const SOLVE_TOLERANCE = 1e-6;

function cloneSketchEntities(entities: SketchEntity[]): SketchEntity[] {
  return entities.map((entity) => cloneSketchEntity(entity));
}

function cloneSketchEntity(entity: SketchEntity): SketchEntity {
  switch (entity.kind) {
    case "sketch.line":
      return {
        ...entity,
        start: [...entity.start],
        end: [...entity.end],
      };
    case "sketch.arc":
      return {
        ...entity,
        start: [...entity.start],
        end: [...entity.end],
        center: [...entity.center],
      };
    case "sketch.circle":
      return {
        ...entity,
        center: [...entity.center],
      };
    case "sketch.ellipse":
      return {
        ...entity,
        center: [...entity.center],
      };
    case "sketch.rectangle":
      return entity.mode === "center"
        ? {
            ...entity,
            center: [...entity.center],
          }
        : {
            ...entity,
            corner: [...entity.corner],
          };
    case "sketch.slot":
      return {
        ...entity,
        center: [...entity.center],
      };
    case "sketch.polygon":
      return {
        ...entity,
        center: [...entity.center],
      };
    case "sketch.spline":
      return {
        ...entity,
        points: entity.points.map((point) => [...point]),
      };
    case "sketch.point":
      return {
        ...entity,
        point: [...entity.point],
      };
  }
}

export function solveSketchConstraints(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchEntity[] {
  const report = solveSketchConstraintsDetailed(sketchId, entities, constraints);
  const failingConstraint = report.constraintStatus.find(
    (entry) => entry.status === "unsatisfied"
  );
  if (failingConstraint) {
    throw new CompileError(
      failingConstraint.code ?? "sketch_constraint_unsatisfied",
      failingConstraint.message ??
        `Sketch ${sketchId} constraint ${failingConstraint.constraintId} could not be satisfied`
    );
  }
  return report.entities;
}

export function solveSketchConstraintsDetailed(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  options?: SketchConstraintSolveOptions
): SketchConstraintSolveReport {
  return solveSketchConstraintsDetailedInternal(sketchId, entities, constraints, options, true);
}

function solveSketchConstraintsDetailedInternal(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  options: SketchConstraintSolveOptions | undefined,
  enrichDiagnostics: boolean
): SketchConstraintSolveReport {
  const execution = createSketchSolveExecutionState(options);
  const transientConstraints = options?.transientConstraints ?? [];
  const allConstraints = [...constraints, ...transientConstraints];
  ensureUniqueConstraintIds(sketchId, allConstraints);
  const solvedEntities = cloneSketchEntities(entities);
  const changedEntityIds = new Set(options?.changedEntityIds ?? []);
  applyWarmStartEntities(solvedEntities, options?.warmStartEntities, changedEntityIds);
  const components = buildConstraintComponents(solvedEntities, allConstraints);
  if (allConstraints.length === 0) {
    return buildSolveReport(
      solvedEntities,
      allConstraints,
      [],
      components,
      finalizeSolveMeta(execution, "not-run", 0)
    );
  }

  const entityMap = new Map(solvedEntities.map((entity) => [entity.id, entity]));
  const entityById = new Map(solvedEntities.map((entity) => [entity.id, entity]));
  const constraintById = new Map(allConstraints.map((constraint) => [constraint.id, constraint]));
  const assignedConstraintIds = new Set<string>();
  const activeComponentIds = collectActiveComponentIds(
    components,
    options,
    transientConstraints
  );

  for (const component of components) {
    if (!activeComponentIds.has(component.componentId)) {
      execution.skippedComponentIds.push(component.componentId);
      continue;
    }
    if (checkAndRecordSolveStop(execution)) {
      execution.skippedComponentIds.push(component.componentId);
      continue;
    }
    const componentConstraints = component.constraintIds
      .map((constraintId) => constraintById.get(constraintId))
      .filter((constraint): constraint is SketchConstraint => !!constraint);
    if (componentConstraints.length === 0) continue;
    for (const constraint of componentConstraints) {
      assignedConstraintIds.add(constraint.id);
    }
    const componentEntities = component.entityIds
      .map((entityId) => entityById.get(entityId))
      .filter((entity): entity is SketchEntity => !!entity);
    solveSketchConstraintsNumerically(
      sketchId,
      componentEntities,
      entityMap,
      componentConstraints,
      execution
    );
    polishSketchConstraints(sketchId, entityMap, componentConstraints, execution);
    if (execution.termination) {
      execution.skippedComponentIds.push(component.componentId);
      continue;
    }
    execution.solvedComponentIds.push(component.componentId);
  }

  const unassignedConstraints = allConstraints.filter(
    (constraint) => !assignedConstraintIds.has(constraint.id)
  );
  if (unassignedConstraints.length > 0) {
    solveSketchConstraintsNumerically(sketchId, [], entityMap, unassignedConstraints, execution);
    polishSketchConstraints(sketchId, entityMap, unassignedConstraints, execution);
  }

  const constraintSourceById = new Map<string, SketchConstraintSource>();
  for (const constraint of constraints) {
    constraintSourceById.set(constraint.id, "authored");
  }
  for (const constraint of transientConstraints) {
    constraintSourceById.set(constraint.id, "transient");
  }
  let constraintStatus = allConstraints.map((constraint) =>
    buildConstraintStatus(
      sketchId,
      entityMap,
      constraint,
      constraintSourceById.get(constraint.id) ?? "authored"
    )
  );
  if (enrichDiagnostics) {
    constraintStatus = enrichConstraintDiagnostics(
      sketchId,
      solvedEntities,
      allConstraints,
      components,
      constraintStatus,
      execution,
      options
    );
  }

  const maxResidual = constraintStatus.reduce(
    (max, entry) => Math.max(max, Number.isFinite(entry.residual) ? entry.residual : max),
    0
  );
  return buildSolveReport(
    solvedEntities,
    allConstraints,
    constraintStatus,
    components,
    finalizeSolveMeta(execution, "converged", maxResidual)
  );
}

export async function solveSketchConstraintsDetailedAsync(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  options?: SketchConstraintSolveOptions
): Promise<SketchConstraintSolveReport> {
  if (options?.signal?.aborted) {
    return solveSketchConstraintsDetailed(sketchId, entities, constraints, options);
  }
  await yieldToMacrotask();
  if (options?.signal?.aborted) {
    return solveSketchConstraintsDetailed(sketchId, entities, constraints, options);
  }
  return solveSketchConstraintsDetailed(sketchId, entities, constraints, options);
}

export async function solveSketchConstraintsAsync(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  options?: SketchConstraintSolveOptions
): Promise<SketchEntity[]> {
  const report = await solveSketchConstraintsDetailedAsync(sketchId, entities, constraints, options);
  const failingConstraint = report.constraintStatus.find(
    (entry) => entry.status === "unsatisfied" && entry.source === "authored"
  );
  if (failingConstraint) {
    throw new CompileError(
      failingConstraint.code ?? "sketch_constraint_unsatisfied",
      failingConstraint.message ??
        `Sketch ${sketchId} constraint ${failingConstraint.constraintId} could not be satisfied`
    );
  }
  return report.entities;
}

export function createSketchConstraintSolveSession(
  sketchId: string,
  constraints: SketchConstraint[]
): SketchConstraintSolveSession {
  let warmStartEntities: SketchEntity[] | undefined;
  let solveVersion = 0;
  return {
    solve: (input) => {
      const currentVersion = ++solveVersion;
      const report = solveSketchConstraintsDetailed(sketchId, input.entities, constraints, {
        transientConstraints: input.transientConstraints,
        warmStartEntities,
        changedEntityIds: input.changedEntityIds,
        changedConstraintIds: input.changedConstraintIds,
        maxIterations: input.maxIterations,
        maxTimeMs: input.maxTimeMs,
        signal: input.signal,
      });
      if (currentVersion === solveVersion && report.solveMeta.termination !== "aborted") {
        warmStartEntities = report.entities.map((entity) => cloneSketchEntity(entity));
      }
      return report;
    },
    solveAsync: async (input) => {
      const currentVersion = ++solveVersion;
      const report = await solveSketchConstraintsDetailedAsync(sketchId, input.entities, constraints, {
        transientConstraints: input.transientConstraints,
        warmStartEntities,
        changedEntityIds: input.changedEntityIds,
        changedConstraintIds: input.changedConstraintIds,
        maxIterations: input.maxIterations,
        maxTimeMs: input.maxTimeMs,
        signal: input.signal,
      });
      if (currentVersion === solveVersion && report.solveMeta.termination !== "aborted") {
        warmStartEntities = report.entities.map((entity) => cloneSketchEntity(entity));
      }
      return report;
    },
    reset: () => {
      warmStartEntities = undefined;
    },
  };
}

function yieldToMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createSketchSolveExecutionState(
  options?: SketchConstraintSolveOptions
): SketchSolveExecutionState {
  const maxTimeMs =
    options?.maxTimeMs !== undefined && Number.isFinite(options.maxTimeMs)
      ? Math.max(0, options.maxTimeMs)
      : null;
  const maxIterations =
    options?.maxIterations !== undefined && Number.isFinite(options.maxIterations)
      ? Math.max(0, Math.floor(options.maxIterations))
      : Number.POSITIVE_INFINITY;
  const startMs = Date.now();
  return {
    startMs,
    deadlineMs: maxTimeMs === null ? null : startMs + maxTimeMs,
    iterationBudget: maxIterations,
    iterations: 0,
    signal: options?.signal,
    termination: null,
    solvedComponentIds: [],
    skippedComponentIds: [],
  };
}

function finalizeSolveMeta(
  execution: SketchSolveExecutionState,
  fallback: SketchConstraintSolveTermination,
  maxResidual: number
): SketchConstraintSolveReport["solveMeta"] {
  const elapsedMs = Date.now() - execution.startMs;
  const termination = execution.termination ?? fallback;
  return {
    termination,
    iterations: execution.iterations,
    elapsedMs,
    maxResidual,
    solvedComponentIds: execution.solvedComponentIds.slice(),
    skippedComponentIds: execution.skippedComponentIds.slice(),
  };
}

function checkAndRecordSolveStop(execution: SketchSolveExecutionState): boolean {
  if (execution.termination) return true;
  if (execution.signal?.aborted) {
    execution.termination = "aborted";
    return true;
  }
  if (execution.iterations >= execution.iterationBudget) {
    execution.termination = "max-iterations";
    return true;
  }
  if (execution.deadlineMs !== null && Date.now() >= execution.deadlineMs) {
    execution.termination = "time-budget";
    return true;
  }
  return false;
}

function enrichConstraintDiagnostics(
  sketchId: string,
  solvedEntities: SketchEntity[],
  constraints: SketchConstraint[],
  components: SketchConstraintComponent[],
  constraintStatus: SketchConstraintStatus[],
  execution: SketchSolveExecutionState,
  options: SketchConstraintSolveOptions | undefined
): SketchConstraintStatus[] {
  if (constraints.length < 2) return constraintStatus;
  if (execution.termination) return constraintStatus;
  if (options?.maxIterations !== undefined || options?.maxTimeMs !== undefined) {
    return constraintStatus;
  }
  if (constraints.length > 24) return constraintStatus;

  const enriched = constraintStatus.map((entry) => ({ ...entry }));
  const statusById = new Map(enriched.map((entry) => [entry.constraintId, entry]));
  const constraintById = new Map(constraints.map((constraint) => [constraint.id, constraint]));

  for (const component of components) {
    const componentEntities = solvedEntities.filter((entity) => component.entityIds.includes(entity.id));
    const componentConstraints = component.constraintIds
      .map((constraintId) => constraintById.get(constraintId))
      .filter((constraint): constraint is SketchConstraint => !!constraint);
    if (componentConstraints.length < 2) continue;
    const componentStatusEntries = component.constraintIds
      .map((constraintId) => statusById.get(constraintId))
      .filter((entry): entry is SketchConstraintStatus => !!entry);
    const unsatisfied = componentStatusEntries.filter((entry) => entry.status === "unsatisfied");
    if (unsatisfied.length > 0) {
      enrichConflictDiagnosticsForComponent(
        sketchId,
        componentEntities,
        componentConstraints,
        componentStatusEntries,
        statusById
      );
      continue;
    }
    enrichRedundancyDiagnosticsForComponent(
      sketchId,
      componentEntities,
      componentConstraints,
      componentStatusEntries,
      statusById
    );
  }
  return enriched;
}

function enrichConflictDiagnosticsForComponent(
  sketchId: string,
  componentEntities: SketchEntity[],
  componentConstraints: SketchConstraint[],
  componentStatusEntries: SketchConstraintStatus[],
  statusById: Map<string, SketchConstraintStatus>
): void {
  const baselineUnsatisfiedCount = componentStatusEntries.filter(
    (entry) => entry.status === "unsatisfied"
  ).length;
  for (const entry of componentStatusEntries) {
    if (entry.status !== "unsatisfied") continue;
    let bestRelatedIds: string[] = [];
    let bestTargetSatisfied = false;
    let bestUnsatisfiedCount = Number.POSITIVE_INFINITY;
    let bestResidual = Number.POSITIVE_INFINITY;

    for (const candidate of componentConstraints) {
      if (candidate.id === entry.constraintId) continue;
      const report = simulateConstraintSolveReport(
        sketchId,
        componentEntities,
        componentConstraints.filter((constraint) => constraint.id !== candidate.id)
      );
      const target = report.report.constraintStatus.find(
        (status) => status.constraintId === entry.constraintId
      );
      if (!target) continue;
      const unsatisfiedCount = report.report.constraintStatus.filter(
        (status) => status.status === "unsatisfied"
      ).length;
      const targetSatisfied = target.status === "satisfied";
      const targetResidual = target.residual;
      const improved =
        targetSatisfied ||
        unsatisfiedCount < baselineUnsatisfiedCount ||
        targetResidual + 1e-9 < entry.residual;
      if (!improved) continue;
      const better =
        Number(targetSatisfied) > Number(bestTargetSatisfied) ||
        (targetSatisfied === bestTargetSatisfied && unsatisfiedCount < bestUnsatisfiedCount) ||
        (targetSatisfied === bestTargetSatisfied &&
          unsatisfiedCount === bestUnsatisfiedCount &&
          targetResidual + 1e-9 < bestResidual);
      if (better) {
        bestRelatedIds = [candidate.id];
        bestTargetSatisfied = targetSatisfied;
        bestUnsatisfiedCount = unsatisfiedCount;
        bestResidual = targetResidual;
        continue;
      }
      const tied =
        targetSatisfied === bestTargetSatisfied &&
        unsatisfiedCount === bestUnsatisfiedCount &&
        Math.abs(targetResidual - bestResidual) <= 1e-9;
      if (tied) bestRelatedIds.push(candidate.id);
    }

    if (bestRelatedIds.length === 0) continue;
    const target = statusById.get(entry.constraintId);
    if (!target) continue;
    target.diagnosticType = "conflict";
    target.relatedConstraintIds = [...new Set(bestRelatedIds)].sort();
    target.code = "sketch_constraint_conflict";
    target.message = `Sketch ${sketchId} constraint ${entry.constraintId} likely conflicts with ${target.relatedConstraintIds.join(", ")}`;
  }
}

function enrichRedundancyDiagnosticsForComponent(
  sketchId: string,
  componentEntities: SketchEntity[],
  componentConstraints: SketchConstraint[],
  componentStatusEntries: SketchConstraintStatus[],
  statusById: Map<string, SketchConstraintStatus>
): void {
  const base = simulateConstraintSolveReport(sketchId, componentEntities, componentConstraints);
  const baseRedundantEquations = base.analysis?.redundantEquations ?? 0;
  const baseRemainingDegreesOfFreedom = base.report.remainingDegreesOfFreedom;
  if (baseRedundantEquations <= 0) return;

  for (const entry of componentStatusEntries) {
    if (entry.status !== "satisfied") continue;
    const reducedConstraints = componentConstraints.filter(
      (constraint) => constraint.id !== entry.constraintId
    );
    if (reducedConstraints.length === 0) continue;
    const reduced = simulateConstraintSolveReport(sketchId, componentEntities, reducedConstraints);
    const reducedRedundantEquations = reduced.analysis?.redundantEquations ?? 0;
    const reducedUnsatisfiedCount = reduced.report.constraintStatus.filter(
      (status) => status.status === "unsatisfied"
    ).length;
    if (reducedUnsatisfiedCount > 0) continue;
    if (reduced.report.remainingDegreesOfFreedom !== baseRemainingDegreesOfFreedom) continue;
    if (reducedRedundantEquations >= baseRedundantEquations) continue;
    const target = statusById.get(entry.constraintId);
    if (!target) continue;
    target.diagnosticType = "redundant";
    target.relatedConstraintIds = componentConstraints
      .filter((constraint) => constraint.id !== entry.constraintId)
      .filter((constraint) =>
        listConstraintEntityIds(constraint).some((entityId) => target.entityIds.includes(entityId))
      )
      .map((constraint) => constraint.id)
      .sort();
    target.code = "sketch_constraint_redundant";
    target.message = `Sketch ${sketchId} constraint ${entry.constraintId} is redundant with the remaining component constraints`;
  }
}

function simulateConstraintSolveReport(
  sketchId: string,
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): {
  report: SketchConstraintSolveReport;
  analysis: SketchConstraintSolveAnalysis | null;
} {
  const simulatedEntities = cloneSketchEntities(entities);
  const entityMap = new Map(simulatedEntities.map((entity) => [entity.id, entity]));
  const components = buildConstraintComponents(simulatedEntities, constraints);
  const execution = createSketchSolveExecutionState();
  const constraintById = new Map(constraints.map((constraint) => [constraint.id, constraint]));

  for (const component of components) {
    const componentConstraints = component.constraintIds
      .map((constraintId) => constraintById.get(constraintId))
      .filter((constraint): constraint is SketchConstraint => !!constraint);
    if (componentConstraints.length === 0) continue;
    const componentEntities = component.entityIds
      .map((entityId) => entityMap.get(entityId))
      .filter((entity): entity is SketchEntity => !!entity);
    solveSketchConstraintsNumerically(
      sketchId,
      componentEntities,
      entityMap,
      componentConstraints,
      execution
    );
    polishSketchConstraints(sketchId, entityMap, componentConstraints, execution);
  }

  const constraintStatus = constraints.map((constraint) =>
    buildConstraintStatus(sketchId, entityMap, constraint, "authored")
  );
  const analysis = analyzeDegreesOfFreedom(simulatedEntities, constraints, components);
  return {
    report: buildSolveReport(
      simulatedEntities,
      constraints,
      constraintStatus,
      components,
      finalizeSolveMeta(execution, "converged", constraintStatus.reduce(
        (max, entry) => Math.max(max, Number.isFinite(entry.residual) ? entry.residual : max),
        0
      ))
    ),
    analysis,
  };
}

function collectActiveComponentIds(
  components: SketchConstraintComponent[],
  options: SketchConstraintSolveOptions | undefined,
  transientConstraints: SketchConstraint[]
): Set<string> {
  const hasChangedEntities = options?.changedEntityIds !== undefined;
  const hasChangedConstraints = options?.changedConstraintIds !== undefined;
  if (!hasChangedEntities && !hasChangedConstraints) {
    return new Set(components.map((component) => component.componentId));
  }
  const changedEntities = new Set(options?.changedEntityIds ?? []);
  const changedConstraints = new Set(options?.changedConstraintIds ?? []);
  for (const constraint of transientConstraints) {
    changedConstraints.add(constraint.id);
  }
  const active = new Set<string>();
  for (const component of components) {
    if (component.entityIds.some((entityId) => changedEntities.has(entityId))) {
      active.add(component.componentId);
      continue;
    }
    if (component.constraintIds.some((constraintId) => changedConstraints.has(constraintId))) {
      active.add(component.componentId);
    }
  }
  return active;
}

function applyWarmStartEntities(
  entities: SketchEntity[],
  warmStartEntities: SketchEntity[] | undefined,
  changedEntityIds: Set<string>
): void {
  if (!warmStartEntities || warmStartEntities.length === 0) return;
  const warmMap = new Map(warmStartEntities.map((entity) => [entity.id, entity]));
  for (const entity of entities) {
    if (changedEntityIds.has(entity.id)) continue;
    const warm = warmMap.get(entity.id);
    if (!warm || warm.kind !== entity.kind) continue;
    copyWarmStartGeometry(entity, warm);
  }
}

function copyWarmStartGeometry(target: SketchEntity, source: SketchEntity): void {
  switch (target.kind) {
    case "sketch.line":
      target.start = [...(source as Extract<SketchEntity, { kind: "sketch.line" }>).start];
      target.end = [...(source as Extract<SketchEntity, { kind: "sketch.line" }>).end];
      return;
    case "sketch.arc":
      target.start = [...(source as Extract<SketchEntity, { kind: "sketch.arc" }>).start];
      target.end = [...(source as Extract<SketchEntity, { kind: "sketch.arc" }>).end];
      target.center = [...(source as Extract<SketchEntity, { kind: "sketch.arc" }>).center];
      return;
    case "sketch.circle":
      target.center = [...(source as Extract<SketchEntity, { kind: "sketch.circle" }>).center];
      target.radius = (source as Extract<SketchEntity, { kind: "sketch.circle" }>).radius;
      return;
    case "sketch.ellipse":
      target.center = [...(source as Extract<SketchEntity, { kind: "sketch.ellipse" }>).center];
      return;
    case "sketch.rectangle":
      if (target.mode === "center" && source.kind === "sketch.rectangle" && source.mode === "center") {
        target.center = [...source.center];
      } else if (
        target.mode === "corner" &&
        source.kind === "sketch.rectangle" &&
        source.mode === "corner"
      ) {
        target.corner = [...source.corner];
      }
      return;
    case "sketch.slot":
      target.center = [...(source as Extract<SketchEntity, { kind: "sketch.slot" }>).center];
      return;
    case "sketch.polygon":
      target.center = [...(source as Extract<SketchEntity, { kind: "sketch.polygon" }>).center];
      return;
    case "sketch.point":
      target.point = [...(source as Extract<SketchEntity, { kind: "sketch.point" }>).point];
      return;
    case "sketch.spline":
      return;
  }
}

function solverAnalysisDeps(): SolverAnalysisDeps {
  return {
    solveTolerance: SOLVE_TOLERANCE,
    collectScalarVariables: (entities) => collectScalarVariables(entities, SOLVE_EPSILON),
    constraintResidualComponents,
    estimateConstraintConsumption,
    estimateEntityDegreesOfFreedom,
    estimateMatrixRank,
    estimateRigidBodyModes,
    listConstraintEntityIds,
    measureConstraintResidual,
  };
}

function buildSolveReport(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  constraintStatus: SketchConstraintStatus[],
  components = buildConstraintComponents(entities, constraints),
  solveMeta: SketchConstraintSolveReport["solveMeta"] = {
    termination: "not-run",
    iterations: 0,
    elapsedMs: 0,
    maxResidual: 0,
    solvedComponentIds: [],
    skippedComponentIds: [],
  }
): SketchConstraintSolveReport {
  return buildSketchSolveReport(
    solverAnalysisDeps(),
    entities,
    constraints,
    constraintStatus,
    components,
    solveMeta
  );
}

function buildConstraintStatus(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint,
  source: SketchConstraintSource
): SketchConstraintStatus {
  return buildSketchConstraintStatus(
    solverAnalysisDeps(),
    sketchId,
    entityMap,
    constraint,
    source
  );
}

function ensureUniqueConstraintIds(
  sketchId: string,
  constraints: SketchConstraint[]
): void {
  ensureUniqueSketchConstraintIds(sketchId, constraints);
}

function buildConstraintComponents(
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchConstraintComponent[] {
  return buildSketchConstraintComponents(solverAnalysisDeps(), entities, constraints);
}

function analyzeDegreesOfFreedom(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  components: SketchConstraintComponent[]
): SketchConstraintSolveAnalysis | null {
  return analyzeSketchDegreesOfFreedom(solverAnalysisDeps(), entities, constraints, components);
}

function buildConstraintResidualRowRanges(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): Array<{ start: number; length: number }> {
  return buildSketchConstraintResidualRowRanges(
    solverAnalysisDeps(),
    sketchId,
    entityMap,
    constraints
  );
}

function buildComponentStatus(
  component: SketchConstraintComponent,
  entities: SketchEntity[],
  constraintStatus: SketchConstraintStatus[],
  consumption: { totalConsumed: number; byEntity: Map<string, number> },
  analysis: SketchConstraintSolveAnalysis | null
): SketchConstraintComponentStatus {
  return buildSketchComponentStatus(
    solverAnalysisDeps(),
    component,
    entities,
    constraintStatus,
    consumption,
    analysis
  );
}

function buildConstraintResidualVector(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): number[] {
  return buildSketchConstraintResidualVector(
    solverAnalysisDeps(),
    sketchId,
    entityMap,
    constraints
  );
}

function buildConstraintJacobian(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[],
  variables: ScalarVariable[],
  baseResidual = buildConstraintResidualVector(sketchId, entityMap, constraints)
): number[][] {
  return buildSketchConstraintJacobian(
    solverAnalysisDeps(),
    sketchId,
    entityMap,
    constraints,
    variables,
    baseResidual
  );
}

function solveSketchConstraintsNumerically(
  sketchId: string,
  entities: SketchEntity[],
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[],
  execution: SketchSolveExecutionState
): void {
  const variables = collectDrivenVariables(entities, constraints, SOLVE_EPSILON);
  if (variables.length === 0 || constraints.length === 0) return;

  let damping = 1e-3;
  let trustRadius = Math.max(1, Math.sqrt(variables.length));
  const localMaxIterations = Math.max(10, constraints.length * 6);

  for (let iteration = 0; iteration < localMaxIterations; iteration += 1) {
    if (checkAndRecordSolveStop(execution)) return;
    execution.iterations += 1;
    const residual = buildConstraintResidualVector(sketchId, entityMap, constraints);
    if (maxAbsValue(residual) <= SOLVE_TOLERANCE) return;
    const currentNorm = vectorNorm(residual);
    const currentObjective = 0.5 * currentNorm * currentNorm;

    const jacobian = buildConstraintJacobian(sketchId, entityMap, constraints, variables, residual);
    if (jacobian.length === 0) return;
    const variableScales = estimateVariableScales(variables);
    const scaledJacobian = scaleJacobianColumns(jacobian, variableScales);

    const normalMatrix = buildNormalMatrix(scaledJacobian);
    const gradient = buildNormalGradient(scaledJacobian, residual);
    if (vectorNorm(gradient) <= SOLVE_TOLERANCE * Math.max(1, vectorNorm(residual))) {
      return;
    }

    const baseValues = variables.map((variable) => variable.read());
    let accepted = false;
    let trialDamping = damping;

    for (let attempt = 0; attempt < 8 && !accepted; attempt += 1) {
      const regularizedNormal = addLevenbergRegularization(normalMatrix, trialDamping);
      let scaledStep = solveLinearSystem(
        regularizedNormal,
        gradient.map((value) => -value)
      );
      if (!scaledStep) {
        scaledStep = fallbackGradientStep(gradient, normalMatrix, trialDamping);
      }
      if (!scaledStep) {
        trialDamping *= 6;
        trustRadius = Math.max(0.1, trustRadius * 0.5);
        continue;
      }
      const clamped = clampVectorToTrustRadius(scaledStep, trustRadius);
      const step = unscaleVariableStep(clamped.step, variableScales);
      if (vectorNorm(step) <= SOLVE_TOLERANCE * 0.1) {
        restoreVariableValues(variables, baseValues);
        return;
      }

      let stepScale = 1;
      let acceptedRatio = -Infinity;
      let acceptedUsedTrustBoundary = clamped.clamped;
      for (let lineSearch = 0; lineSearch < 6; lineSearch += 1) {
        const scaledTrialStep = scaleVector(clamped.step, stepScale);
        const trialStep = unscaleVariableStep(scaledTrialStep, variableScales);
        applyVariableStep(variables, baseValues, trialStep, 1);
        const nextResidual = buildConstraintResidualVector(sketchId, entityMap, constraints);
        const nextNorm = vectorNorm(nextResidual);
        const nextObjective = 0.5 * nextNorm * nextNorm;
        const actualReduction = currentObjective - nextObjective;
        const predictedReduction = computeQuadraticModelReduction(
          gradient,
          normalMatrix,
          scaledTrialStep
        );
        const ratio =
          predictedReduction <= SOLVE_EPSILON
            ? -Infinity
            : actualReduction / predictedReduction;
        if (actualReduction > 0 && ratio > 1e-4) {
          acceptedRatio = ratio;
          acceptedUsedTrustBoundary =
            acceptedUsedTrustBoundary ||
            (Math.abs(vectorNorm(scaledTrialStep) - trustRadius) <= 1e-9);
          accepted = true;
          break;
        }
        restoreVariableValues(variables, baseValues);
        stepScale *= 0.5;
      }

      if (!accepted) {
        trialDamping *= 4;
        trustRadius = Math.max(0.1, trustRadius * 0.6);
      } else {
        if (acceptedRatio < 0.25) {
          damping = Math.min(1e6, trialDamping * 2);
          trustRadius = Math.max(0.1, trustRadius * 0.7);
        } else if (acceptedRatio > 0.75 && acceptedUsedTrustBoundary) {
          damping = Math.max(1e-8, trialDamping * 0.5);
          trustRadius = Math.min(1e6, trustRadius * 1.5);
        } else {
          damping = Math.max(1e-8, trialDamping * 0.9);
        }
      }
    }

    if (!accepted) {
      restoreVariableValues(variables, baseValues);
      return;
    }
  }
}

function polishSketchConstraints(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[],
  execution: SketchSolveExecutionState
): void {
  const maxIterations = Math.max(2, constraints.length);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    if (checkAndRecordSolveStop(execution)) return;
    execution.iterations += 1;
    let maxDelta = 0;
    for (const constraint of constraints) {
      maxDelta = Math.max(maxDelta, applyConstraint(sketchId, entityMap, constraint));
    }
    if (maxDelta <= SOLVE_TOLERANCE) return;
  }
}


function estimateConstraintConsumption(
  constraints: SketchConstraint[]
): { totalConsumed: number; byEntity: Map<string, number> } {
  const byEntity = new Map<string, number>();
  let totalConsumed = 0;

  for (const constraint of constraints) {
    const consume = (entityId: string, amount: number): void => {
      totalConsumed += amount;
      byEntity.set(entityId, (byEntity.get(entityId) ?? 0) + amount);
    };

    switch (constraint.kind) {
      case "sketch.constraint.coincident":
        consume(constraint.b.entity, 2);
        break;
      case "sketch.constraint.horizontal":
      case "sketch.constraint.vertical":
        consume(constraint.line, 1);
        break;
      case "sketch.constraint.parallel":
      case "sketch.constraint.perpendicular":
      case "sketch.constraint.equalLength":
      case "sketch.constraint.angle":
      case "sketch.constraint.tangent":
      case "sketch.constraint.concentric":
        consume(constraint.b, 1);
        break;
      case "sketch.constraint.collinear":
        consume(constraint.b, 2);
        break;
      case "sketch.constraint.distance":
        consume(constraint.b.entity, 1);
        break;
      case "sketch.constraint.pointOnLine":
        consume(constraint.point.entity, 1);
        break;
      case "sketch.constraint.midpoint":
        consume(constraint.point.entity, 2);
        break;
      case "sketch.constraint.symmetry":
        consume(constraint.b.entity, 2);
        break;
      case "sketch.constraint.radius":
        consume(constraint.curve, 1);
        break;
      case "sketch.constraint.fixPoint":
        consume(
          constraint.point.entity,
          (constraint.x === undefined ? 0 : 1) + (constraint.y === undefined ? 0 : 1)
        );
        break;
    }
  }

  return { totalConsumed, byEntity };
}

function countAnchorAxes(constraints: SketchConstraint[]): number {
  let axes = 0;
  for (const constraint of constraints) {
    if (constraint.kind !== "sketch.constraint.fixPoint") continue;
    if (constraint.x !== undefined) axes += 1;
    if (constraint.y !== undefined) axes += 1;
  }
  return axes;
}

function listConstraintEntityIds(constraint: SketchConstraint): string[] {
  switch (constraint.kind) {
    case "sketch.constraint.coincident":
      return dedupeEntityIds([constraint.a.entity, constraint.b.entity]);
    case "sketch.constraint.horizontal":
    case "sketch.constraint.vertical":
      return [constraint.line];
    case "sketch.constraint.parallel":
    case "sketch.constraint.perpendicular":
    case "sketch.constraint.equalLength":
    case "sketch.constraint.angle":
    case "sketch.constraint.tangent":
    case "sketch.constraint.concentric":
    case "sketch.constraint.collinear":
      return dedupeEntityIds([constraint.a, constraint.b]);
    case "sketch.constraint.pointOnLine":
    case "sketch.constraint.midpoint":
      return dedupeEntityIds([constraint.point.entity, constraint.line]);
    case "sketch.constraint.symmetry":
      return dedupeEntityIds([constraint.a.entity, constraint.b.entity, constraint.axis]);
    case "sketch.constraint.distance":
      return dedupeEntityIds([constraint.a.entity, constraint.b.entity]);
    case "sketch.constraint.radius":
      return [constraint.curve];
    case "sketch.constraint.fixPoint":
      return [constraint.point.entity];
  }
}

function estimateEntityDegreesOfFreedom(entity: SketchEntity): number {
  switch (entity.kind) {
    case "sketch.line":
      return 4;
    case "sketch.arc":
      return 6;
    case "sketch.circle":
      return 3;
    case "sketch.ellipse":
    case "sketch.slot":
    case "sketch.polygon":
    case "sketch.rectangle":
    case "sketch.point":
      return 2;
    case "sketch.spline":
      return 0;
  }
}

function applyConstraint(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint
): number {
  switch (constraint.kind) {
    case "sketch.constraint.coincident": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      const target = a.read();
      const before = b.read();
      b.write(target);
      return distance(before, target);
    }
    case "sketch.constraint.horizontal": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const next: NumericPoint = [end[0], start[1]];
      line.writeEnd(next);
      return Math.abs(end[1] - next[1]);
    }
    case "sketch.constraint.vertical": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const next: NumericPoint = [start[0], end[1]];
      line.writeEnd(next);
      return Math.abs(end[0] - next[0]);
    }
    case "sketch.constraint.parallel": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const axis = lineDirection(referenceStart, referenceEnd, sketchId, constraint.id);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const targetLength = targetLineLength(currentStart, currentEnd, distance(referenceStart, referenceEnd));
      const direction = chooseAlignedDirection(axis, subtract(currentEnd, currentStart));
      const next = add(currentStart, scale(direction, targetLength));
      target.writeEnd(next);
      return distance(currentEnd, next);
    }
    case "sketch.constraint.perpendicular": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const axis = lineDirection(referenceStart, referenceEnd, sketchId, constraint.id);
      const baseCandidates = perpendicularDirections(axis);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const targetLength = targetLineLength(currentStart, currentEnd, distance(referenceStart, referenceEnd));
      const direction = chooseClosestDirection(baseCandidates, subtract(currentEnd, currentStart));
      const next = add(currentStart, scale(direction, targetLength));
      target.writeEnd(next);
      return distance(currentEnd, next);
    }
    case "sketch.constraint.equalLength": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const referenceVector = subtract(referenceEnd, referenceStart);
      const referenceLength = vectorLength(referenceVector);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const currentVector = subtract(currentEnd, currentStart);
      const direction: NumericVector =
        vectorLength(currentVector) > SOLVE_EPSILON
          ? normalize(currentVector)
          : referenceLength > SOLVE_EPSILON
            ? normalize(referenceVector)
            : [1, 0];
      const next = add(currentStart, scale(direction, referenceLength));
      target.writeEnd(next);
      return distance(currentEnd, next);
    }
    case "sketch.constraint.collinear": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const axis = lineDirection(referenceStart, referenceEnd, sketchId, constraint.id);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const targetLength = targetLineLength(
        currentStart,
        currentEnd,
        distance(referenceStart, referenceEnd)
      );
      const projectedStart = add(
        referenceStart,
        scale(axis, dot(subtract(currentStart, referenceStart), axis))
      );
      const direction = chooseAlignedDirection(axis, subtract(currentEnd, currentStart));
      const projectedEnd = add(projectedStart, scale(direction, targetLength));
      target.write(projectedStart, projectedEnd);
      return Math.max(distance(currentStart, projectedStart), distance(currentEnd, projectedEnd));
    }
    case "sketch.constraint.midpoint": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const midpoint: NumericPoint = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5];
      const current = point.read();
      point.write(midpoint);
      return distance(current, midpoint);
    }
    case "sketch.constraint.symmetry": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      const axis = resolveLine(sketchId, entityMap, constraint.axis);
      const axisStart = axis.readStart();
      const axisEnd = axis.readEnd();
      const axisDirection = lineDirection(axisStart, axisEnd, sketchId, constraint.id);
      const source = a.read();
      const current = b.read();
      const projection = add(
        axisStart,
        scale(axisDirection, dot(subtract(source, axisStart), axisDirection))
      );
      const mirrored: NumericPoint = [
        2 * projection[0] - source[0],
        2 * projection[1] - source[1],
      ];
      b.write(mirrored);
      return distance(current, mirrored);
    }
    case "sketch.constraint.tangent": {
      const referenceLine = tryResolveLine(sketchId, entityMap, constraint.a);
      const targetLine = tryResolveLine(sketchId, entityMap, constraint.b);
      const referenceCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.a, SOLVE_EPSILON);
      const targetCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.b, SOLVE_EPSILON);

      if (referenceLine && targetCurve) {
        return projectCurveToLineTangency(referenceLine, targetCurve, SOLVE_EPSILON);
      }
      if (referenceCurve && targetLine) {
        return projectLineToCurveTangency(targetLine, referenceCurve, SOLVE_EPSILON);
      }
      if (referenceCurve && targetCurve) {
        return projectCurveToCurveTangency(referenceCurve, targetCurve, SOLVE_EPSILON);
      }
      throw new CompileError(
        "sketch_constraint_kind_mismatch",
        `Sketch ${sketchId} tangent constraint ${constraint.id} requires line/arc/circle references`
      );
    }
    case "sketch.constraint.concentric": {
      const reference = resolveConcentricCurve(sketchId, entityMap, constraint.a, SOLVE_EPSILON);
      const target = resolveConcentricCurve(sketchId, entityMap, constraint.b, SOLVE_EPSILON);
      const referenceCenter = reference.readCenter();
      const currentTargetCenter = target.readCenter();
      target.writeCenter(referenceCenter);
      return distance(currentTargetCenter, referenceCenter);
    }
    case "sketch.constraint.pointOnLine": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const axis = lineDirection(start, end, sketchId, constraint.id);
      const current = point.read();
      const projected = add(start, scale(axis, dot(subtract(current, start), axis)));
      point.write(projected);
      return distance(current, projected);
    }
    case "sketch.constraint.distance": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      if (samePointRef(constraint.a, constraint.b)) {
        throw new CompileError(
          "sketch_constraint_invalid_reference",
          `Sketch ${sketchId} distance constraint ${constraint.id} requires distinct point refs`
        );
      }
      const origin = a.read();
      const current = b.read();
      const delta = subtract(current, origin);
      const currentLength = vectorLength(delta);
      const targetDistance = toFiniteNumber(
        constraint.distance,
        `Sketch ${sketchId} distance constraint ${constraint.id}`
      );
      const direction: NumericVector =
        currentLength <= SOLVE_EPSILON ? [1, 0] : normalize(delta);
      const next = add(origin, scale(direction, targetDistance));
      b.write(next);
      return distance(current, next);
    }
    case "sketch.constraint.angle": {
      const reference = resolveLine(sketchId, entityMap, constraint.a);
      const target = resolveLine(sketchId, entityMap, constraint.b);
      const referenceStart = reference.readStart();
      const referenceEnd = reference.readEnd();
      const axis = lineDirection(referenceStart, referenceEnd, sketchId, constraint.id);
      const currentStart = target.readStart();
      const currentEnd = target.readEnd();
      const targetLength = targetLineLength(
        currentStart,
        currentEnd,
        distance(referenceStart, referenceEnd)
      );
      const angle = readAngleConstraint(
        constraint.angle,
        `Sketch ${sketchId} angle constraint ${constraint.id}`
      );
      const direction = chooseClosestDirection(
        angleDirections(axis, angle),
        subtract(currentEnd, currentStart)
      );
      const next = add(currentStart, scale(direction, targetLength));
      target.writeEnd(next);
      return distance(currentEnd, next);
    }
    case "sketch.constraint.radius": {
      const curve = resolveRadiusTarget(sketchId, entityMap, constraint.curve, SOLVE_EPSILON);
      const targetRadius = readPositiveRadius(
        constraint.radius,
        `Sketch ${sketchId} radius constraint ${constraint.id}`
      );
      return curve.write(targetRadius);
    }
    case "sketch.constraint.fixPoint": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const current = point.read();
      const next: NumericPoint = [
        constraint.x === undefined
          ? current[0]
          : toFiniteNumber(constraint.x, `Sketch ${sketchId} fixPoint constraint ${constraint.id} x`),
        constraint.y === undefined
          ? current[1]
          : toFiniteNumber(constraint.y, `Sketch ${sketchId} fixPoint constraint ${constraint.id} y`),
      ];
      point.write(next);
      return distance(current, next);
    }
  }
}

function measureConstraintResidual(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint
): number {
  const components = constraintResidualComponents(sketchId, entityMap, constraint);
  return components.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}

function constraintResidualComponents(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint
): number[] {
  switch (constraint.kind) {
    case "sketch.constraint.coincident": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      const aPoint = a.read();
      const bPoint = b.read();
      return [aPoint[0] - bPoint[0], aPoint[1] - bPoint[1]];
    }
    case "sketch.constraint.horizontal": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      return [line.readStart()[1] - line.readEnd()[1]];
    }
    case "sketch.constraint.vertical": {
      const line = resolveLine(sketchId, entityMap, constraint.line);
      return [line.readStart()[0] - line.readEnd()[0]];
    }
    case "sketch.constraint.parallel": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const ref = lineDirection(a.readStart(), a.readEnd(), sketchId, constraint.id);
      const target = lineDirection(b.readStart(), b.readEnd(), sketchId, constraint.id);
      return [cross(ref, target)];
    }
    case "sketch.constraint.perpendicular": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const ref = lineDirection(a.readStart(), a.readEnd(), sketchId, constraint.id);
      const target = lineDirection(b.readStart(), b.readEnd(), sketchId, constraint.id);
      return [dot(ref, target)];
    }
    case "sketch.constraint.equalLength": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const refLength = distance(a.readStart(), a.readEnd());
      const targetLength = distance(b.readStart(), b.readEnd());
      return [refLength - targetLength];
    }
    case "sketch.constraint.collinear": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const refStart = a.readStart();
      const refEnd = a.readEnd();
      const targetStart = b.readStart();
      const targetEnd = b.readEnd();
      const refDir = lineDirection(refStart, refEnd, sketchId, constraint.id);
      const targetDir = lineDirection(targetStart, targetEnd, sketchId, constraint.id);
      return [
        cross(refDir, targetDir),
        cross(refDir, subtract(targetStart, refStart)),
      ];
    }
    case "sketch.constraint.midpoint": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const targetMidpoint: NumericPoint = [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5];
      const current = point.read();
      return [current[0] - targetMidpoint[0], current[1] - targetMidpoint[1]];
    }
    case "sketch.constraint.symmetry": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      const axis = resolveLine(sketchId, entityMap, constraint.axis);
      const axisStart = axis.readStart();
      const axisEnd = axis.readEnd();
      const axisDir = lineDirection(axisStart, axisEnd, sketchId, constraint.id);
      const pointA = a.read();
      const pointB = b.read();
      const midpoint: NumericPoint = [
        (pointA[0] + pointB[0]) * 0.5,
        (pointA[1] + pointB[1]) * 0.5,
      ];
      return [
        cross(axisDir, subtract(midpoint, axisStart)),
        dot(subtract(pointB, pointA), axisDir),
      ];
    }
    case "sketch.constraint.tangent": {
      const referenceLine = tryResolveLine(sketchId, entityMap, constraint.a);
      const targetLine = tryResolveLine(sketchId, entityMap, constraint.b);
      const referenceCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.a, SOLVE_EPSILON);
      const targetCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.b, SOLVE_EPSILON);

      if (referenceLine && targetCurve) {
        const lineStart = referenceLine.readStart();
        const lineEnd = referenceLine.readEnd();
        const axis = lineDirection(lineStart, lineEnd, sketchId, constraint.id);
        const normal: NumericVector = [-axis[1], axis[0]];
        const center = targetCurve.readCenter();
        const radius = targetCurve.readRadius();
        const signedDistance = dot(subtract(center, lineStart), normal);
        return [signedDistance * signedDistance - radius * radius];
      }
      if (referenceCurve && targetLine) {
        const lineStart = targetLine.readStart();
        const lineEnd = targetLine.readEnd();
        const axis = lineDirection(lineStart, lineEnd, sketchId, constraint.id);
        const normal: NumericVector = [-axis[1], axis[0]];
        const center = referenceCurve.readCenter();
        const radius = referenceCurve.readRadius();
        const signedDistance = dot(subtract(center, lineStart), normal);
        return [signedDistance * signedDistance - radius * radius];
      }
      if (referenceCurve && targetCurve) {
        const centerDistance = distance(referenceCurve.readCenter(), targetCurve.readCenter());
        const expectedSeparation = preferredCurveSeparation(
          centerDistance,
          referenceCurve.readRadius(),
          targetCurve.readRadius()
        );
        return [centerDistance - expectedSeparation];
      }
      throw new CompileError(
        "sketch_constraint_kind_mismatch",
        `Sketch ${sketchId} tangent constraint ${constraint.id} requires line/arc/circle references`
      );
    }
    case "sketch.constraint.concentric": {
      const a = resolveConcentricCurve(sketchId, entityMap, constraint.a, SOLVE_EPSILON);
      const b = resolveConcentricCurve(sketchId, entityMap, constraint.b, SOLVE_EPSILON);
      const centerA = a.readCenter();
      const centerB = b.readCenter();
      return [centerA[0] - centerB[0], centerA[1] - centerB[1]];
    }
    case "sketch.constraint.pointOnLine": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const line = resolveLine(sketchId, entityMap, constraint.line);
      const start = line.readStart();
      const end = line.readEnd();
      const axis = lineDirection(start, end, sketchId, constraint.id);
      const offset = subtract(point.read(), start);
      return [cross(axis, offset)];
    }
    case "sketch.constraint.distance": {
      const a = resolvePointRef(sketchId, entityMap, constraint.a);
      const b = resolvePointRef(sketchId, entityMap, constraint.b);
      const expected = toFiniteNumber(
        constraint.distance,
        `Sketch ${sketchId} distance constraint ${constraint.id}`
      );
      return [distance(a.read(), b.read()) - expected];
    }
    case "sketch.constraint.angle": {
      const a = resolveLine(sketchId, entityMap, constraint.a);
      const b = resolveLine(sketchId, entityMap, constraint.b);
      const expected = degToRad(
        readAngleConstraint(
          constraint.angle,
          `Sketch ${sketchId} angle constraint ${constraint.id}`
        )
      );
      const ref = lineDirection(a.readStart(), a.readEnd(), sketchId, constraint.id);
      const target = lineDirection(b.readStart(), b.readEnd(), sketchId, constraint.id);
      return [angleBetween(ref, target) - expected];
    }
    case "sketch.constraint.radius": {
      const entity = entityMap.get(constraint.curve);
      if (!entity) {
        throw new CompileError(
          "sketch_constraint_reference_missing",
          `Sketch ${sketchId} references missing curve ${constraint.curve}`
        );
      }
      const expected = readPositiveRadius(
        constraint.radius,
        `Sketch ${sketchId} radius constraint ${constraint.id}`
      );
      if (entity.kind === "sketch.circle") {
        const current = toFiniteNumber(
          entity.radius,
          `Sketch ${sketchId} circle ${constraint.curve} radius`
        );
        return [current - expected];
      }
      if (entity.kind === "sketch.arc") {
        const center = readNumericPoint(entity.center, `Sketch ${sketchId} arc ${constraint.curve} center`);
        const start = readNumericPoint(entity.start, `Sketch ${sketchId} arc ${constraint.curve} start`);
        const end = readNumericPoint(entity.end, `Sketch ${sketchId} arc ${constraint.curve} end`);
        return [
          distance(center, start) - expected,
          distance(center, end) - expected,
        ];
      }
      throw new CompileError(
        "sketch_constraint_kind_mismatch",
        `Sketch ${sketchId} radius constraint ${constraint.curve} must reference a sketch.circle or sketch.arc`
      );
    }
    case "sketch.constraint.fixPoint": {
      const point = resolvePointRef(sketchId, entityMap, constraint.point);
      const current = point.read();
      const out: number[] = [];
      if (constraint.x !== undefined) {
        out.push(current[0] - toFiniteNumber(constraint.x, `Sketch ${sketchId} fixPoint x`));
      }
      if (constraint.y !== undefined) {
        out.push(current[1] - toFiniteNumber(constraint.y, `Sketch ${sketchId} fixPoint y`));
      }
      return out;
    }
  }
}
