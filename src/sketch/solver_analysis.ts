import { CompileError } from "../errors.js";
import type { SketchConstraint, SketchEntity } from "../ir.js";
import {
  estimateNullspaceBasis,
  listAdmissibleRigidBodyModes,
  orthonormalizeVectorBasis,
  removeBasisProjection,
  vectorNorm,
} from "./solver_math.js";
import type {
  SketchConstraintMotionDirection,
  SketchConstraintComponentSolveStatus,
  SketchConstraintComponentStatus,
  SketchConstraintEntityStatus,
  SketchConstraintSolveReport,
  SketchConstraintSolveStatus,
  SketchConstraintSource,
  SketchConstraintStatus,
} from "./constraints.js";

type ScalarVariable = {
  entityId: string;
  handle: string;
  kind: "x" | "y" | "scalar";
  read: () => number;
  write: (value: number) => void;
  readPoint?: () => [number, number];
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

export type SolverAnalysisDeps = {
  solveTolerance: number;
  collectScalarVariables: (entities: SketchEntity[]) => ScalarVariable[];
  constraintResidualComponents: (
    sketchId: string,
    entityMap: Map<string, SketchEntity>,
    constraint: SketchConstraint
  ) => number[];
  estimateConstraintConsumption: (
    constraints: SketchConstraint[]
  ) => { totalConsumed: number; byEntity: Map<string, number> };
  estimateEntityDegreesOfFreedom: (entity: SketchEntity) => number;
  estimateMatrixRank: (matrix: number[][], relativeTolerance?: number) => number;
  estimateRigidBodyModes: (jacobian: number[][], variables: ScalarVariable[]) => number;
  listConstraintEntityIds: (constraint: SketchConstraint) => string[];
  measureConstraintResidual: (
    sketchId: string,
    entityMap: Map<string, SketchEntity>,
    constraint: SketchConstraint
  ) => number;
};

export function buildSolveReport(
  deps: SolverAnalysisDeps,
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  constraintStatus: SketchConstraintStatus[],
  components = buildConstraintComponents(deps, entities, constraints),
  solveMeta: SketchConstraintSolveReport["solveMeta"] = {
    termination: "not-run",
    iterations: 0,
    elapsedMs: 0,
    maxResidual: 0,
    solvedComponentIds: [],
    skippedComponentIds: [],
  }
): SketchConstraintSolveReport {
  const totalDegreesOfFreedom = entities.reduce(
    (sum, entity) => sum + deps.estimateEntityDegreesOfFreedom(entity),
    0
  );
  const consumption = deps.estimateConstraintConsumption(constraints);
  const analysis = analyzeDegreesOfFreedom(deps, entities, constraints, components);
  const unsatisfiedEntities = new Set(
    constraintStatus
      .filter((entry) => entry.status === "unsatisfied")
      .flatMap((entry) => entry.entityIds)
  );
  const constrainedEntities = new Set(constraintStatus.flatMap((entry) => entry.entityIds));
  const hasConflict = constraintStatus.some((entry) => entry.status === "unsatisfied");
  const componentStatus = components.map((component) =>
    buildComponentStatus(deps, component, entities, constraintStatus, consumption, analysis)
  );
  const remainingDegreesOfFreedom = componentStatus.reduce(
    (sum, component) => sum + component.remainingDegreesOfFreedom,
    0
  );
  const internalRemainingDegreesOfFreedom = componentStatus.reduce(
    (sum, component) => sum + component.internalRemainingDegreesOfFreedom,
    0
  );
  const hasRedundancy =
    componentStatus.some((component) => component.status === "overconstrained") ||
    (analysis?.redundantEquations ?? 0) > 0;
  const componentById = new Map(componentStatus.map((component) => [component.componentId, component]));
  const entityToComponent =
    analysis?.entityToComponent ??
    new Map(
      components.flatMap((component) =>
        component.entityIds.map((entityId) => [entityId, component.componentId] as const)
      )
    );
  const overallStatus: SketchConstraintSolveStatus = hasConflict
    ? "conflict"
    : constraints.length > 0 && remainingDegreesOfFreedom > 0 && internalRemainingDegreesOfFreedom === 0
      ? "ambiguous"
      : remainingDegreesOfFreedom === 0 && hasRedundancy
        ? "overconstrained"
        : remainingDegreesOfFreedom === 0
          ? "fully-constrained"
          : "underconstrained";
  const perEntityStatus = entities.map((entity) => {
    const total = deps.estimateEntityDegreesOfFreedom(entity);
    const remaining =
      analysis?.perEntityRemaining.get(entity.id) ??
      Math.max(0, total - (consumption.byEntity.get(entity.id) ?? 0));
    const componentId = entityToComponent.get(entity.id) ?? `component.unmapped.${entity.id}`;
    const component = componentById.get(componentId);
    const componentSolveStatus = component?.status ?? "underconstrained";
    let status: SketchConstraintSolveStatus;
    if (unsatisfiedEntities.has(entity.id)) status = "conflict";
    else if (componentSolveStatus === "overconstrained" && constrainedEntities.has(entity.id)) {
      status = "overconstrained";
    } else if (componentSolveStatus === "fully-constrained" && constrainedEntities.has(entity.id)) {
      status = "fully-constrained";
    } else {
      status = remaining === 0 && component?.grounded ? "fully-constrained" : "underconstrained";
    }
    return {
      entityId: entity.id,
      componentId,
      totalDegreesOfFreedom: total,
      remainingDegreesOfFreedom: remaining,
      grounded: component?.grounded ?? false,
      rigidBodyDegreesOfFreedom: component?.rigidBodyDegreesOfFreedom ?? 0,
      componentStatus: componentSolveStatus,
      status,
    } satisfies SketchConstraintEntityStatus;
  });
  return {
    entities,
    totalDegreesOfFreedom,
    remainingDegreesOfFreedom,
    status: overallStatus,
    componentStatus,
    entityStatus: perEntityStatus,
    constraintStatus,
    solveMeta,
  };
}

export function buildConstraintStatus(
  deps: SolverAnalysisDeps,
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint,
  source: SketchConstraintSource
): SketchConstraintStatus {
  const entityIds = deps.listConstraintEntityIds(constraint);
  try {
    const residual = deps.measureConstraintResidual(sketchId, entityMap, constraint);
    if (residual <= deps.solveTolerance * 10) {
      return {
        constraintId: constraint.id,
        kind: constraint.kind,
        source,
        status: "satisfied",
        residual,
        entityIds,
      };
    }
    return {
      constraintId: constraint.id,
      kind: constraint.kind,
      source,
      status: "unsatisfied",
      residual,
      entityIds,
      code: "sketch_constraint_unsatisfied",
      message: `Sketch ${sketchId} constraint ${constraint.id} could not be satisfied`,
    };
  } catch (err) {
    if (err instanceof CompileError) {
      return {
        constraintId: constraint.id,
        kind: constraint.kind,
        source,
        status: "unsatisfied",
        residual: Number.POSITIVE_INFINITY,
        entityIds,
        code: err.code,
        message: err.message,
      };
    }
    throw err;
  }
}

export function ensureUniqueConstraintIds(
  sketchId: string,
  constraints: SketchConstraint[]
): void {
  const seen = new Set<string>();
  for (const constraint of constraints) {
    if (seen.has(constraint.id)) {
      throw new CompileError(
        "sketch_constraint_duplicate_id",
        `Sketch ${sketchId} has duplicate constraint id ${constraint.id}`
      );
    }
    seen.add(constraint.id);
  }
}

export function buildConstraintComponents(
  deps: Pick<SolverAnalysisDeps, "listConstraintEntityIds">,
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchConstraintComponent[] {
  const entityIds = entities.map((entity) => entity.id);
  const adjacency = new Map<string, Set<string>>();
  const constraintEntityIds = new Map<string, string[]>();

  for (const entityId of entityIds) adjacency.set(entityId, new Set());

  for (const constraint of constraints) {
    const ids = deps.listConstraintEntityIds(constraint).filter((id) => adjacency.has(id));
    constraintEntityIds.set(constraint.id, ids);
    if (ids.length <= 1) continue;
    for (let i = 0; i < ids.length; i += 1) {
      const current = ids[i];
      if (!current) continue;
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      for (let j = 0; j < ids.length; j += 1) {
        if (i === j) continue;
        const other = ids[j];
        if (!other) continue;
        neighbors.add(other);
      }
    }
  }

  const visited = new Set<string>();
  const components: SketchConstraintComponent[] = [];
  for (let index = 0; index < entityIds.length; index += 1) {
    const start = entityIds[index];
    if (!start || visited.has(start)) continue;
    const queue = [start];
    const entityIdsInComponent: string[] = [];
    visited.add(start);
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (!current) continue;
      entityIdsInComponent.push(current);
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    const entitySet = new Set(entityIdsInComponent);
    const constraintIds = constraints
      .filter((constraint) => {
        const ids = constraintEntityIds.get(constraint.id) ?? [];
        return ids.some((id) => entitySet.has(id));
      })
      .map((constraint) => constraint.id);

    components.push({
      componentId: `component.${components.length + 1}`,
      entityIds: entityIdsInComponent,
      constraintIds,
    });
  }

  return components;
}

export function analyzeDegreesOfFreedom(
  deps: SolverAnalysisDeps,
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  components: SketchConstraintComponent[]
): SketchConstraintSolveAnalysis | null {
  if (constraints.length === 0) return null;
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const variables = deps.collectScalarVariables(entities);
  if (variables.length === 0) {
    return {
      remainingDegreesOfFreedom: 0,
      internalRemainingDegreesOfFreedom: 0,
      redundantEquations: 0,
      perEntityRemaining: new Map(),
      componentAnalysis: new Map(),
      entityToComponent: new Map(
        components.flatMap((component) =>
          component.entityIds.map((entityId) => [entityId, component.componentId] as const)
        )
      ),
    };
  }

  let baseResidual: number[];
  let jacobian: number[][];
  let rowRanges: Array<{ start: number; length: number }>;
  try {
    baseResidual = buildConstraintResidualVector(deps, "analysis", entityMap, constraints);
    jacobian = buildConstraintJacobian(deps, "analysis", entityMap, constraints, variables, baseResidual);
    rowRanges = buildConstraintResidualRowRanges(deps, "analysis", entityMap, constraints);
  } catch {
    return null;
  }

  const rank = deps.estimateMatrixRank(jacobian);
  const nullspaceBasis = estimateNullspaceBasis(jacobian);
  const rigidMotionBasis = listAdmissibleRigidBodyModes(jacobian, variables);
  const internalMotionBasis = orthonormalizeVectorBasis(
    nullspaceBasis.map((direction) => removeBasisProjection(direction, rigidMotionBasis))
  );
  const remainingDegreesOfFreedom = Math.max(0, variables.length - rank);
  const rigidModes = rigidMotionBasis.length;
  const internalRemainingDegreesOfFreedom = Math.max(
    0,
    remainingDegreesOfFreedom - Math.min(remainingDegreesOfFreedom, rigidModes)
  );
  const redundantEquations = Math.max(0, baseResidual.length - rank);
  const perEntityRemaining = new Map<string, number>();
  const componentAnalysis = new Map<string, SketchConstraintComponentAnalysis>();
  const entityToComponent = new Map<string, string>();

  for (const entity of entities) {
    const total = deps.estimateEntityDegreesOfFreedom(entity);
    if (total === 0) {
      perEntityRemaining.set(entity.id, 0);
      continue;
    }
    const columns = variables
      .map((variable, index) => (variable.entityId === entity.id ? index : -1))
      .filter((index) => index >= 0);
    if (columns.length === 0) {
      perEntityRemaining.set(entity.id, total);
      continue;
    }
    const entityMotionBasis = nullspaceBasis.map((direction) =>
      columns.map((index) => direction[index] ?? 0)
    );
    const attributedRemaining = deps.estimateMatrixRank(entityMotionBasis, 1e-5);
    perEntityRemaining.set(entity.id, Math.min(total, attributedRemaining));
  }

  const variableIndexByEntity = new Map<string, number[]>();
  for (let index = 0; index < variables.length; index += 1) {
    const variable = variables[index];
    if (!variable) continue;
    const existing = variableIndexByEntity.get(variable.entityId);
    if (existing) existing.push(index);
    else variableIndexByEntity.set(variable.entityId, [index]);
  }
  const constraintIndexById = new Map(constraints.map((constraint, index) => [constraint.id, index]));

  for (const component of components) {
    for (const entityId of component.entityIds) entityToComponent.set(entityId, component.componentId);
    const componentVariables = component.entityIds.flatMap(
      (entityId) => variableIndexByEntity.get(entityId) ?? []
    );
    const componentRowIndexes = component.constraintIds.flatMap((constraintId) => {
      const constraintIndex = constraintIndexById.get(constraintId);
      if (constraintIndex === undefined) return [];
      const range = rowRanges[constraintIndex];
      if (!range) return [];
      return new Array(range.length).fill(0).map((_, offset) => range.start + offset);
    });
    const componentJacobian = componentRowIndexes.map((rowIndex) =>
      componentVariables.map((colIndex) => jacobian[rowIndex]?.[colIndex] ?? 0)
    );
    const componentRank = deps.estimateMatrixRank(componentJacobian);
    const componentRemainingDegreesOfFreedom = Math.max(0, componentVariables.length - componentRank);
    const resolvedComponentVariables = componentVariables
      .map((index) => variables[index])
      .filter((value): value is ScalarVariable => !!value);
    const componentNullspaceBasis = estimateNullspaceBasis(componentJacobian);
    const componentRigidMotionBasis = listAdmissibleRigidBodyModes(
      componentJacobian,
      resolvedComponentVariables
    );
    const componentInternalMotionBasis = orthonormalizeVectorBasis(
      componentNullspaceBasis.map((direction) =>
        removeBasisProjection(direction, componentRigidMotionBasis)
      )
    );
    const componentRigidBodyDegreesOfFreedom = componentRigidMotionBasis.length;
    const componentInternalRemainingDegreesOfFreedom = Math.max(
      0,
      componentRemainingDegreesOfFreedom -
        Math.min(componentRemainingDegreesOfFreedom, componentRigidBodyDegreesOfFreedom)
    );
    const componentTotalDegreesOfFreedom = component.entityIds.reduce((sum, entityId) => {
      const entity = entityMap.get(entityId);
      return sum + (entity ? deps.estimateEntityDegreesOfFreedom(entity) : 0);
    }, 0);
    componentAnalysis.set(component.componentId, {
      componentId: component.componentId,
      totalDegreesOfFreedom: componentTotalDegreesOfFreedom,
      remainingDegreesOfFreedom: componentRemainingDegreesOfFreedom,
      internalRemainingDegreesOfFreedom: componentInternalRemainingDegreesOfFreedom,
      rigidBodyDegreesOfFreedom: componentRigidBodyDegreesOfFreedom,
      grounded: componentRigidBodyDegreesOfFreedom === 0,
      redundantEquations: Math.max(0, componentRowIndexes.length - componentRank),
      freeMotionDirections: buildFreeMotionDirections(
        component.componentId,
        resolvedComponentVariables,
        componentInternalMotionBasis,
        componentRigidMotionBasis
      ),
    });
  }

  return {
    remainingDegreesOfFreedom,
    internalRemainingDegreesOfFreedom,
    redundantEquations,
    perEntityRemaining,
    componentAnalysis,
    entityToComponent,
  };
}

export function buildConstraintResidualRowRanges(
  deps: Pick<SolverAnalysisDeps, "constraintResidualComponents">,
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): Array<{ start: number; length: number }> {
  const ranges: Array<{ start: number; length: number }> = [];
  let cursor = 0;
  for (const constraint of constraints) {
    const length = deps.constraintResidualComponents(sketchId, entityMap, constraint).length;
    ranges.push({ start: cursor, length });
    cursor += length;
  }
  return ranges;
}

export function buildComponentStatus(
  deps: Pick<
    SolverAnalysisDeps,
    "collectScalarVariables" | "estimateConstraintConsumption" | "estimateEntityDegreesOfFreedom" | "estimateRigidBodyModes"
  >,
  component: SketchConstraintComponent,
  entities: SketchEntity[],
  constraintStatus: SketchConstraintStatus[],
  consumption: { totalConsumed: number; byEntity: Map<string, number> },
  analysis: SketchConstraintSolveAnalysis | null
): SketchConstraintComponentStatus {
  const entitySet = new Set(component.entityIds);
  const componentEntities = entities.filter((entity) => entitySet.has(entity.id));
  const componentAnalysis = analysis?.componentAnalysis.get(component.componentId);
  const totalDegreesOfFreedom =
    componentAnalysis?.totalDegreesOfFreedom ??
    componentEntities.reduce((sum, entity) => sum + deps.estimateEntityDegreesOfFreedom(entity), 0);
  const remainingDegreesOfFreedom =
    componentAnalysis?.remainingDegreesOfFreedom ??
    Math.max(
      0,
      totalDegreesOfFreedom -
        component.entityIds.reduce((sum, entityId) => sum + (consumption.byEntity.get(entityId) ?? 0), 0)
    );
  const componentVariables = deps.collectScalarVariables(componentEntities);
  const fallbackRigidBodyDegreesOfFreedom = deps.estimateRigidBodyModes([], componentVariables);
  const rigidBodyDegreesOfFreedom =
    componentAnalysis?.rigidBodyDegreesOfFreedom ??
    Math.min(remainingDegreesOfFreedom, fallbackRigidBodyDegreesOfFreedom);
  const internalRemainingDegreesOfFreedom =
    componentAnalysis?.internalRemainingDegreesOfFreedom ??
    Math.max(0, remainingDegreesOfFreedom - Math.min(remainingDegreesOfFreedom, rigidBodyDegreesOfFreedom));
  const grounded = componentAnalysis?.grounded ?? rigidBodyDegreesOfFreedom === 0;
  const redundantEquations = componentAnalysis?.redundantEquations ?? 0;
  const freeMotionDirections = componentAnalysis?.freeMotionDirections ?? [];
  const hasConflict = constraintStatus.some(
    (entry) => entry.status === "unsatisfied" && component.constraintIds.includes(entry.constraintId)
  );
  const hasConstraints = component.constraintIds.length > 0;
  const status: SketchConstraintComponentSolveStatus = hasConflict
    ? "conflict"
    : remainingDegreesOfFreedom === 0 && redundantEquations > 0
      ? "overconstrained"
      : remainingDegreesOfFreedom === 0 && grounded
        ? "fully-constrained"
        : hasConstraints && internalRemainingDegreesOfFreedom === 0
          ? "component-constrained"
          : "underconstrained";

  return {
    componentId: component.componentId,
    entityIds: component.entityIds.slice(),
    constraintIds: component.constraintIds.slice(),
    totalDegreesOfFreedom,
    remainingDegreesOfFreedom,
    internalRemainingDegreesOfFreedom,
    rigidBodyDegreesOfFreedom,
    grounded,
    status,
    freeMotionDirections,
  };
}

function buildFreeMotionDirections(
  componentId: string,
  variables: ScalarVariable[],
  internalMotionBasis: number[][],
  rigidMotionBasis: number[][]
): SketchConstraintMotionDirection[] {
  return [
    ...internalMotionBasis.map((direction, index) =>
      buildFreeMotionDirection(componentId, variables, direction, index + 1, "internal")
    ),
    ...rigidMotionBasis.map((direction, index) =>
      buildFreeMotionDirection(componentId, variables, direction, index + 1, "rigid-body")
    ),
  ].filter((direction): direction is SketchConstraintMotionDirection => direction !== null);
}

function buildFreeMotionDirection(
  componentId: string,
  variables: ScalarVariable[],
  direction: number[],
  ordinal: number,
  classification: SketchConstraintMotionDirection["classification"]
): SketchConstraintMotionDirection | null {
  const magnitude = vectorNorm(direction);
  if (magnitude <= 1e-8) return null;
  const normalized = direction.map((value) => value / magnitude);
  const grouped = new Map<
    string,
    {
      entityId: string;
      handle: string;
      point?: [number, number];
      scalar?: number;
    }
  >();

  for (let index = 0; index < variables.length; index += 1) {
    const variable = variables[index];
    if (!variable) continue;
    const delta = normalized[index] ?? 0;
    if (Math.abs(delta) <= 1e-8) continue;
    const key = `${variable.entityId}#${variable.handle}`;
    const current = grouped.get(key) ?? {
      entityId: variable.entityId,
      handle: variable.handle,
    };
    if (variable.kind === "scalar") {
      current.scalar = (current.scalar ?? 0) + delta;
    } else {
      const point = current.point ?? [0, 0];
      if (variable.kind === "x") point[0] += delta;
      else point[1] += delta;
      current.point = point;
    }
    grouped.set(key, current);
  }

  const handles = [...grouped.values()]
    .map((entry) => {
      if (entry.point) {
        const delta: [number, number] = [entry.point[0], entry.point[1]];
        const pointMagnitude = Math.hypot(delta[0], delta[1]);
        if (pointMagnitude <= 1e-8) return null;
        return {
          entityId: entry.entityId,
          handle: entry.handle,
          kind: "point" as const,
          delta,
          magnitude: pointMagnitude,
        };
      }
      const scalar = entry.scalar ?? 0;
      const scalarMagnitude = Math.abs(scalar);
      if (scalarMagnitude <= 1e-8) return null;
      return {
        entityId: entry.entityId,
        handle: entry.handle,
        kind: "scalar" as const,
        delta: scalar,
        magnitude: scalarMagnitude,
      };
    })
    .filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null
    )
    .sort((left, right) =>
      left.entityId.localeCompare(right.entityId) || left.handle.localeCompare(right.handle)
    );
  if (handles.length === 0) return null;

  return {
    directionId: `${componentId}.direction.${classification}.${ordinal}`,
    classification,
    magnitude,
    entityIds: [...new Set(handles.map((entry) => entry.entityId))],
    handles,
  };
}

export function buildConstraintResidualVector(
  deps: Pick<SolverAnalysisDeps, "constraintResidualComponents">,
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): number[] {
  return constraints.flatMap((constraint) =>
    deps.constraintResidualComponents(sketchId, entityMap, constraint)
  );
}

export function buildConstraintJacobian(
  deps: Pick<
    SolverAnalysisDeps,
    "constraintResidualComponents" | "collectScalarVariables"
  >,
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[],
  variables: ScalarVariable[],
  baseResidual = buildConstraintResidualVector(deps, sketchId, entityMap, constraints)
): number[][] {
  if (baseResidual.length === 0 || variables.length === 0) return [];
  const jacobian = new Array(baseResidual.length)
    .fill(0)
    .map(() => new Array(variables.length).fill(0));

  for (let col = 0; col < variables.length; col += 1) {
    const variable = variables[col];
    if (!variable) continue;
    const before = variable.read();
    const epsilon = variable.kind === "scalar" ? 1e-4 : 1e-5;
    variable.write(before + epsilon);
    const nextPlus = buildConstraintResidualVector(deps, sketchId, entityMap, constraints);
    variable.write(before - epsilon);
    const nextMinus = buildConstraintResidualVector(deps, sketchId, entityMap, constraints);
    variable.write(before);
    if (nextPlus.length !== baseResidual.length || nextMinus.length !== baseResidual.length) {
      throw new Error("Sketch DOF analysis residual vector changed size during perturbation");
    }
    for (let row = 0; row < baseResidual.length; row += 1) {
      const rowData = jacobian[row];
      if (!rowData) continue;
      rowData[col] = ((nextPlus[row] ?? 0) - (nextMinus[row] ?? 0)) / (2 * epsilon);
    }
  }

  return jacobian;
}
