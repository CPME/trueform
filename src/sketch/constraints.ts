import { CompileError } from "../errors.js";
import type { Point2D, SketchConstraint, SketchConstraintPointRef, SketchEntity } from "../ir.js";

type NumericPoint = [number, number];
type NumericVector = [number, number];
type ScalarVariableKind = "x" | "y" | "scalar";

type ScalarVariable = {
  entityId: string;
  handle: string;
  kind: ScalarVariableKind;
  read: () => number;
  write: (value: number) => void;
  readPoint?: () => NumericPoint;
};

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

export type SketchConstraintSolveOptions = {
  transientConstraints?: SketchConstraint[];
};

export type SketchConstraintStatus = {
  constraintId: string;
  kind: SketchConstraint["kind"];
  source: SketchConstraintSource;
  status: SketchConstraintDiagnosticStatus;
  residual: number;
  entityIds: string[];
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
};

export type SketchConstraintSolveReport = {
  entities: SketchEntity[];
  totalDegreesOfFreedom: number;
  remainingDegreesOfFreedom: number;
  status: SketchConstraintSolveStatus;
  componentStatus: SketchConstraintComponentStatus[];
  entityStatus: SketchConstraintEntityStatus[];
  constraintStatus: SketchConstraintStatus[];
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
};

type SketchConstraintSolveAnalysis = {
  remainingDegreesOfFreedom: number;
  internalRemainingDegreesOfFreedom: number;
  redundantEquations: number;
  perEntityRemaining: Map<string, number>;
  componentAnalysis: Map<string, SketchConstraintComponentAnalysis>;
  entityToComponent: Map<string, string>;
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
  const transientConstraints = options?.transientConstraints ?? [];
  const allConstraints = [...constraints, ...transientConstraints];
  ensureUniqueConstraintIds(sketchId, allConstraints);
  const solvedEntities = cloneSketchEntities(entities);
  const components = buildConstraintComponents(solvedEntities, allConstraints);
  if (allConstraints.length === 0) {
    return buildSolveReport(solvedEntities, allConstraints, [], components);
  }

  const entityMap = new Map(solvedEntities.map((entity) => [entity.id, entity]));
  const entityById = new Map(solvedEntities.map((entity) => [entity.id, entity]));
  const constraintById = new Map(allConstraints.map((constraint) => [constraint.id, constraint]));
  const assignedConstraintIds = new Set<string>();

  for (const component of components) {
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
    solveSketchConstraintsNumerically(sketchId, componentEntities, entityMap, componentConstraints);
    polishSketchConstraints(sketchId, entityMap, componentConstraints);
  }

  const unassignedConstraints = allConstraints.filter(
    (constraint) => !assignedConstraintIds.has(constraint.id)
  );
  if (unassignedConstraints.length > 0) {
    solveSketchConstraintsNumerically(sketchId, [], entityMap, unassignedConstraints);
    polishSketchConstraints(sketchId, entityMap, unassignedConstraints);
  }

  const constraintSourceById = new Map<string, SketchConstraintSource>();
  for (const constraint of constraints) {
    constraintSourceById.set(constraint.id, "authored");
  }
  for (const constraint of transientConstraints) {
    constraintSourceById.set(constraint.id, "transient");
  }
  const constraintStatus = allConstraints.map((constraint) =>
    buildConstraintStatus(
      sketchId,
      entityMap,
      constraint,
      constraintSourceById.get(constraint.id) ?? "authored"
    )
  );

  return buildSolveReport(solvedEntities, allConstraints, constraintStatus, components);
}

function buildSolveReport(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  constraintStatus: SketchConstraintStatus[],
  components = buildConstraintComponents(entities, constraints)
): SketchConstraintSolveReport {
  const totalDegreesOfFreedom = entities.reduce(
    (sum, entity) => sum + estimateEntityDegreesOfFreedom(entity),
    0
  );
  const consumption = estimateConstraintConsumption(constraints);
  const analysis = analyzeDegreesOfFreedom(entities, constraints, components);
  const unsatisfiedEntities = new Set(
    constraintStatus
      .filter((entry) => entry.status === "unsatisfied")
      .flatMap((entry) => entry.entityIds)
  );
  const constrainedEntities = new Set(
    constraintStatus.flatMap((entry) => entry.entityIds)
  );
  const hasConflict = constraintStatus.some((entry) => entry.status === "unsatisfied");
  const componentStatus = components.map((component) =>
    buildComponentStatus(component, entities, constraintStatus, consumption, analysis)
  );
  const remainingDegreesOfFreedom =
    componentStatus.reduce((sum, component) => sum + component.remainingDegreesOfFreedom, 0);
  const internalRemainingDegreesOfFreedom =
    componentStatus.reduce(
      (sum, component) => sum + component.internalRemainingDegreesOfFreedom,
      0
    );
  const hasRedundancy =
    componentStatus.some((component) => component.status === "overconstrained") ||
    (analysis?.redundantEquations ?? 0) > 0;
  const componentById = new Map(
    componentStatus.map((component) => [component.componentId, component])
  );
  const entityToComponent = analysis?.entityToComponent ?? new Map(
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
    const total = estimateEntityDegreesOfFreedom(entity);
    const remaining = analysis?.perEntityRemaining.get(entity.id) ?? Math.max(
      0,
      total - (consumption.byEntity.get(entity.id) ?? 0)
    );
    const componentId = entityToComponent.get(entity.id) ?? `component.unmapped.${entity.id}`;
    const component = componentById.get(componentId);
    const componentSolveStatus = component?.status ?? "underconstrained";
    let status: SketchConstraintSolveStatus;
    if (unsatisfiedEntities.has(entity.id)) {
      status = "conflict";
    } else if (componentSolveStatus === "overconstrained" && constrainedEntities.has(entity.id)) {
      status = "overconstrained";
    } else if (
      componentSolveStatus === "fully-constrained" &&
      constrainedEntities.has(entity.id)
    ) {
      status = "fully-constrained";
    } else if (remaining === 0 && component?.grounded) {
      status = "fully-constrained";
    } else if (remaining === 0) {
      status = "underconstrained";
    } else {
      status = "underconstrained";
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
  };
}

function buildConstraintStatus(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraint: SketchConstraint,
  source: SketchConstraintSource
): SketchConstraintStatus {
  const entityIds = listConstraintEntityIds(constraint);
  try {
    const residual = measureConstraintResidual(sketchId, entityMap, constraint);
    if (residual <= SOLVE_TOLERANCE * 10) {
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

function ensureUniqueConstraintIds(
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

function buildConstraintComponents(
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): SketchConstraintComponent[] {
  const entityIds = entities.map((entity) => entity.id);
  const adjacency = new Map<string, Set<string>>();
  const constraintEntityIds = new Map<string, string[]>();

  for (const entityId of entityIds) {
    adjacency.set(entityId, new Set());
  }

  for (const constraint of constraints) {
    const ids = listConstraintEntityIds(constraint).filter((id) => adjacency.has(id));
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

function analyzeDegreesOfFreedom(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  components: SketchConstraintComponent[]
): SketchConstraintSolveAnalysis | null {
  if (constraints.length === 0) return null;
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const variables = collectScalarVariables(entities);
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
    baseResidual = buildConstraintResidualVector("analysis", entityMap, constraints);
    jacobian = buildConstraintJacobian("analysis", entityMap, constraints, variables, baseResidual);
    rowRanges = buildConstraintResidualRowRanges("analysis", entityMap, constraints);
  } catch {
    return null;
  }

  const rank = estimateMatrixRank(jacobian);
  const remainingDegreesOfFreedom = Math.max(0, variables.length - rank);
  const rigidModes = estimateRigidBodyModes(jacobian, variables);
  const internalRemainingDegreesOfFreedom = Math.max(
    0,
    remainingDegreesOfFreedom - Math.min(remainingDegreesOfFreedom, rigidModes)
  );
  const redundantEquations = Math.max(0, baseResidual.length - rank);
  const perEntityRemaining = new Map<string, number>();
  const componentAnalysis = new Map<string, SketchConstraintComponentAnalysis>();
  const entityToComponent = new Map<string, string>();

  for (const entity of entities) {
    const total = estimateEntityDegreesOfFreedom(entity);
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
    const submatrix = jacobian.map((row) => columns.map((index) => row[index] ?? 0));
    const localRank = estimateMatrixRank(submatrix);
    perEntityRemaining.set(entity.id, Math.max(0, total - localRank));
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
    for (const entityId of component.entityIds) {
      entityToComponent.set(entityId, component.componentId);
    }
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
    const componentRank = estimateMatrixRank(componentJacobian);
    const componentRemainingDegreesOfFreedom = Math.max(0, componentVariables.length - componentRank);
    const componentRigidBodyDegreesOfFreedom = estimateRigidBodyModes(
      componentJacobian,
      componentVariables.map((index) => variables[index]).filter((value): value is ScalarVariable => !!value)
    );
    const componentInternalRemainingDegreesOfFreedom = Math.max(
      0,
      componentRemainingDegreesOfFreedom -
        Math.min(componentRemainingDegreesOfFreedom, componentRigidBodyDegreesOfFreedom)
    );
    const componentTotalDegreesOfFreedom = component.entityIds.reduce((sum, entityId) => {
      const entity = entityMap.get(entityId);
      return sum + (entity ? estimateEntityDegreesOfFreedom(entity) : 0);
    }, 0);
    componentAnalysis.set(component.componentId, {
      componentId: component.componentId,
      totalDegreesOfFreedom: componentTotalDegreesOfFreedom,
      remainingDegreesOfFreedom: componentRemainingDegreesOfFreedom,
      internalRemainingDegreesOfFreedom: componentInternalRemainingDegreesOfFreedom,
      rigidBodyDegreesOfFreedom: componentRigidBodyDegreesOfFreedom,
      grounded: componentRigidBodyDegreesOfFreedom === 0,
      redundantEquations: Math.max(0, componentRowIndexes.length - componentRank),
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

function buildConstraintResidualRowRanges(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): Array<{ start: number; length: number }> {
  const ranges: Array<{ start: number; length: number }> = [];
  let cursor = 0;
  for (const constraint of constraints) {
    const length = constraintResidualComponents(sketchId, entityMap, constraint).length;
    ranges.push({ start: cursor, length });
    cursor += length;
  }
  return ranges;
}

function buildComponentStatus(
  component: SketchConstraintComponent,
  entities: SketchEntity[],
  constraintStatus: SketchConstraintStatus[],
  consumption: { totalConsumed: number; byEntity: Map<string, number> },
  analysis: SketchConstraintSolveAnalysis | null
): SketchConstraintComponentStatus {
  const entitySet = new Set(component.entityIds);
  const componentEntities = entities.filter((entity) => entitySet.has(entity.id));
  const componentAnalysis = analysis?.componentAnalysis.get(component.componentId);
  const totalDegreesOfFreedom = componentAnalysis?.totalDegreesOfFreedom ?? componentEntities.reduce(
    (sum, entity) => sum + estimateEntityDegreesOfFreedom(entity),
    0
  );
  const remainingDegreesOfFreedom = componentAnalysis?.remainingDegreesOfFreedom ?? Math.max(
    0,
    totalDegreesOfFreedom -
      component.entityIds.reduce(
        (sum, entityId) => sum + (consumption.byEntity.get(entityId) ?? 0),
        0
      )
  );
  const componentVariables = collectScalarVariables(componentEntities);
  const fallbackRigidBodyDegreesOfFreedom = estimateRigidBodyModes([], componentVariables);
  const rigidBodyDegreesOfFreedom =
    componentAnalysis?.rigidBodyDegreesOfFreedom ?? Math.min(
      remainingDegreesOfFreedom,
      fallbackRigidBodyDegreesOfFreedom
    );
  const internalRemainingDegreesOfFreedom =
    componentAnalysis?.internalRemainingDegreesOfFreedom ?? Math.max(
      0,
      remainingDegreesOfFreedom - Math.min(remainingDegreesOfFreedom, rigidBodyDegreesOfFreedom)
    );
  const grounded = componentAnalysis?.grounded ?? rigidBodyDegreesOfFreedom === 0;
  const redundantEquations = componentAnalysis?.redundantEquations ?? 0;
  const hasConflict = constraintStatus.some(
    (entry) =>
      entry.status === "unsatisfied" &&
      component.constraintIds.includes(entry.constraintId)
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
  };
}

function buildConstraintResidualVector(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): number[] {
  return constraints.flatMap((constraint) =>
    constraintResidualComponents(sketchId, entityMap, constraint)
  );
}

function buildConstraintJacobian(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[],
  variables: ScalarVariable[],
  baseResidual = buildConstraintResidualVector(sketchId, entityMap, constraints)
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
    const nextPlus = buildConstraintResidualVector(sketchId, entityMap, constraints);
    variable.write(before - epsilon);
    const nextMinus = buildConstraintResidualVector(sketchId, entityMap, constraints);
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

function solveSketchConstraintsNumerically(
  sketchId: string,
  entities: SketchEntity[],
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): void {
  const variables = collectDrivenVariables(entities, constraints);
  if (variables.length === 0 || constraints.length === 0) return;

  let damping = 1e-3;
  const maxIterations = Math.max(10, constraints.length * 6);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const residual = buildConstraintResidualVector(sketchId, entityMap, constraints);
    if (maxAbsValue(residual) <= SOLVE_TOLERANCE) return;

    const jacobian = buildConstraintJacobian(sketchId, entityMap, constraints, variables, residual);
    if (jacobian.length === 0) return;

    const normalMatrix = buildNormalMatrix(jacobian);
    const gradient = buildNormalGradient(jacobian, residual);
    if (vectorNorm(gradient) <= SOLVE_TOLERANCE * Math.max(1, vectorNorm(residual))) {
      return;
    }

    const baseValues = variables.map((variable) => variable.read());
    const currentNorm = vectorNorm(residual);
    let accepted = false;
    let trialDamping = damping;

    for (let attempt = 0; attempt < 8 && !accepted; attempt += 1) {
      const step = solveLinearSystem(
        addDampedDiagonal(normalMatrix, trialDamping),
        gradient.map((value) => -value)
      );
      if (!step) {
        trialDamping *= 10;
        continue;
      }
      if (vectorNorm(step) <= SOLVE_TOLERANCE * 0.1) {
        restoreVariableValues(variables, baseValues);
        return;
      }

      let stepScale = 1;
      for (let lineSearch = 0; lineSearch < 6; lineSearch += 1) {
        applyVariableStep(variables, baseValues, step, stepScale);
        const nextResidual = buildConstraintResidualVector(sketchId, entityMap, constraints);
        if (vectorNorm(nextResidual) + 1e-12 < currentNorm) {
          damping = Math.max(1e-6, trialDamping * 0.5);
          accepted = true;
          break;
        }
        restoreVariableValues(variables, baseValues);
        stepScale *= 0.5;
      }

      if (!accepted) {
        trialDamping *= 10;
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
  constraints: SketchConstraint[]
): void {
  const maxIterations = Math.max(2, constraints.length);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let maxDelta = 0;
    for (const constraint of constraints) {
      maxDelta = Math.max(maxDelta, applyConstraint(sketchId, entityMap, constraint));
    }
    if (maxDelta <= SOLVE_TOLERANCE) return;
  }
}

function buildNormalMatrix(jacobian: number[][]): number[][] {
  const rows = jacobian.length;
  const cols = jacobian[0]?.length ?? 0;
  const normal = new Array(cols).fill(0).map(() => new Array(cols).fill(0));
  for (let row = 0; row < rows; row += 1) {
    const rowData = jacobian[row];
    if (!rowData) continue;
    for (let left = 0; left < cols; left += 1) {
      const leftValue = rowData[left] ?? 0;
      if (leftValue === 0) continue;
      for (let right = left; right < cols; right += 1) {
        const contribution = leftValue * (rowData[right] ?? 0);
        normal[left]![right] = (normal[left]![right] ?? 0) + contribution;
        if (left !== right) {
          normal[right]![left] = (normal[right]![left] ?? 0) + contribution;
        }
      }
    }
  }
  return normal;
}

function buildNormalGradient(jacobian: number[][], residual: number[]): number[] {
  const cols = jacobian[0]?.length ?? 0;
  const out = new Array(cols).fill(0);
  for (let row = 0; row < jacobian.length; row += 1) {
    const rowData = jacobian[row];
    if (!rowData) continue;
    const residualValue = residual[row] ?? 0;
    for (let col = 0; col < cols; col += 1) {
      out[col] = (out[col] ?? 0) + (rowData[col] ?? 0) * residualValue;
    }
  }
  return out;
}

function addDampedDiagonal(matrix: number[][], damping: number): number[][] {
  return matrix.map((row, rowIndex) =>
    row.map((value, colIndex) => value + (rowIndex === colIndex ? damping : 0))
  );
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
  const size = matrix.length;
  if (size === 0) return [];
  const augmented = matrix.map((row, rowIndex) => [...row, rhs[rowIndex] ?? 0]);
  const tolerance = 1e-10;

  for (let pivot = 0; pivot < size; pivot += 1) {
    let bestRow = pivot;
    let bestValue = Math.abs(augmented[pivot]?.[pivot] ?? 0);
    for (let row = pivot + 1; row < size; row += 1) {
      const value = Math.abs(augmented[row]?.[pivot] ?? 0);
      if (value > bestValue) {
        bestValue = value;
        bestRow = row;
      }
    }
    if (bestValue <= tolerance) return null;
    if (bestRow !== pivot) {
      const temp = augmented[pivot];
      augmented[pivot] = augmented[bestRow] ?? [];
      augmented[bestRow] = temp ?? [];
    }

    const pivotValue = augmented[pivot]?.[pivot] ?? 0;
    const pivotRow = augmented[pivot];
    if (!pivotRow) return null;
    for (let col = pivot; col <= size; col += 1) {
      pivotRow[col] = (pivotRow[col] ?? 0) / pivotValue;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const rowData = augmented[row];
      if (!rowData) continue;
      const factor = rowData[pivot] ?? 0;
      if (Math.abs(factor) <= tolerance) continue;
      for (let col = pivot; col <= size; col += 1) {
        rowData[col] = (rowData[col] ?? 0) - factor * (pivotRow[col] ?? 0);
      }
    }
  }

  return augmented.map((row) => row[size] ?? 0);
}

function applyVariableStep(
  variables: ScalarVariable[],
  baseValues: number[],
  step: number[],
  scaleFactor: number
): void {
  for (let index = 0; index < variables.length; index += 1) {
    const variable = variables[index];
    if (!variable) continue;
    variable.write((baseValues[index] ?? 0) + (step[index] ?? 0) * scaleFactor);
  }
}

function restoreVariableValues(variables: ScalarVariable[], values: number[]): void {
  for (let index = 0; index < variables.length; index += 1) {
    const variable = variables[index];
    if (!variable) continue;
    variable.write(values[index] ?? variable.read());
  }
}

function maxAbsValue(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
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
      const referenceCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.a);
      const targetCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.b);

      if (referenceLine && targetCurve) {
        return projectCurveToLineTangency(referenceLine, targetCurve);
      }
      if (referenceCurve && targetLine) {
        return projectLineToCurveTangency(targetLine, referenceCurve);
      }
      if (referenceCurve && targetCurve) {
        return projectCurveToCurveTangency(referenceCurve, targetCurve);
      }
      throw new CompileError(
        "sketch_constraint_kind_mismatch",
        `Sketch ${sketchId} tangent constraint ${constraint.id} requires line/arc/circle references`
      );
    }
    case "sketch.constraint.concentric": {
      const reference = resolveConcentricCurve(sketchId, entityMap, constraint.a);
      const target = resolveConcentricCurve(sketchId, entityMap, constraint.b);
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
      const curve = resolveRadiusTarget(sketchId, entityMap, constraint.curve);
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
      const referenceCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.a);
      const targetCurve = tryResolveTangentCurve(sketchId, entityMap, constraint.b);

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
      const a = resolveConcentricCurve(sketchId, entityMap, constraint.a);
      const b = resolveConcentricCurve(sketchId, entityMap, constraint.b);
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

function resolveLine(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  lineId: string
): {
  readStart: () => NumericPoint;
  readEnd: () => NumericPoint;
  writeStart: (point: NumericPoint) => void;
  write: (start: NumericPoint, end: NumericPoint) => void;
  writeEnd: (point: NumericPoint) => void;
} {
  const entity = entityMap.get(lineId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing line ${lineId}`
    );
  }
  if (entity.kind !== "sketch.line") {
    throw new CompileError(
      "sketch_constraint_kind_mismatch",
      `Sketch ${sketchId} constraint line ${lineId} must reference a sketch.line`
    );
  }
  return {
    readStart: () => readNumericPoint(entity.start, `Sketch ${sketchId} line ${lineId} start`),
    readEnd: () => readNumericPoint(entity.end, `Sketch ${sketchId} line ${lineId} end`),
    writeStart: (point) => {
      entity.start = point;
    },
    write: (start, end) => {
      entity.start = start;
      entity.end = end;
    },
    writeEnd: (point) => {
      entity.end = point;
    },
  };
}

function tryResolveLine(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  lineId: string
): ReturnType<typeof resolveLine> | null {
  const entity = entityMap.get(lineId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing entity ${lineId}`
    );
  }
  if (entity.kind !== "sketch.line") return null;
  return resolveLine(sketchId, entityMap, lineId);
}

type CurveCenterAccessor = {
  readCenter: () => NumericPoint;
  writeCenter: (center: NumericPoint) => number;
};

type TangentCurveAccessor = CurveCenterAccessor & {
  readRadius: () => number;
};

function resolveConcentricCurve(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  curveId: string
): CurveCenterAccessor {
  const curve = tryResolveTangentCurve(sketchId, entityMap, curveId);
  if (curve) return curve;
  throw new CompileError(
    "sketch_constraint_kind_mismatch",
    `Sketch ${sketchId} concentric constraint curve ${curveId} must reference a sketch.circle or sketch.arc`
  );
}

function tryResolveTangentCurve(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  curveId: string
): TangentCurveAccessor | null {
  const entity = entityMap.get(curveId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing entity ${curveId}`
    );
  }

  if (entity.kind === "sketch.circle") {
    return {
      readCenter: () => readNumericPoint(entity.center, `Sketch ${sketchId} circle ${curveId} center`),
      readRadius: () => readPositiveRadius(entity.radius, `Sketch ${sketchId} circle ${curveId} radius`),
      writeCenter: (nextCenter) => {
        const currentCenter = readNumericPoint(
          entity.center,
          `Sketch ${sketchId} circle ${curveId} center`
        );
        entity.center = nextCenter;
        return distance(currentCenter, nextCenter);
      },
    };
  }

  if (entity.kind === "sketch.arc") {
    return {
      readCenter: () => readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`),
      readRadius: () => {
        const center = readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`);
        const start = readNumericPoint(entity.start, `Sketch ${sketchId} arc ${curveId} start`);
        const end = readNumericPoint(entity.end, `Sketch ${sketchId} arc ${curveId} end`);
        const startRadius = distance(center, start);
        const endRadius = distance(center, end);
        if (startRadius <= SOLVE_EPSILON || endRadius <= SOLVE_EPSILON) {
          throw new CompileError(
            "sketch_constraint_invalid_reference",
            `Sketch ${sketchId} arc ${curveId} must have endpoints away from center`
          );
        }
        return (startRadius + endRadius) * 0.5;
      },
      writeCenter: (nextCenter) => {
        const currentCenter = readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`);
        const delta = subtract(nextCenter, currentCenter);
        const start = readNumericPoint(entity.start, `Sketch ${sketchId} arc ${curveId} start`);
        const end = readNumericPoint(entity.end, `Sketch ${sketchId} arc ${curveId} end`);
        entity.center = nextCenter;
        entity.start = add(start, delta);
        entity.end = add(end, delta);
        return distance(currentCenter, nextCenter);
      },
    };
  }

  return null;
}

function projectCurveToLineTangency(
  referenceLine: ReturnType<typeof resolveLine>,
  targetCurve: TangentCurveAccessor
): number {
  const lineStart = referenceLine.readStart();
  const lineEnd = referenceLine.readEnd();
  const axis = normalize(subtract(lineEnd, lineStart));
  const normal: NumericVector = [-axis[1], axis[0]];
  const center = targetCurve.readCenter();
  const signedDistance = dot(subtract(center, lineStart), normal);
  const radius = targetCurve.readRadius();
  const desiredSignedDistance =
    Math.abs(signedDistance) <= SOLVE_EPSILON
      ? radius
      : Math.sign(signedDistance) * radius;
  const nextCenter = add(center, scale(normal, desiredSignedDistance - signedDistance));
  return targetCurve.writeCenter(nextCenter);
}

function projectLineToCurveTangency(
  targetLine: ReturnType<typeof resolveLine>,
  referenceCurve: TangentCurveAccessor
): number {
  const lineStart = targetLine.readStart();
  const lineEnd = targetLine.readEnd();
  const axis = normalize(subtract(lineEnd, lineStart));
  const normal: NumericVector = [-axis[1], axis[0]];
  const center = referenceCurve.readCenter();
  const radius = referenceCurve.readRadius();
  const signedDistance = dot(subtract(center, lineStart), normal);
  const desiredSignedDistance =
    Math.abs(signedDistance) <= SOLVE_EPSILON
      ? radius
      : Math.sign(signedDistance) * radius;
  const shift = scale(normal, signedDistance - desiredSignedDistance);
  const nextStart = add(lineStart, shift);
  const nextEnd = add(lineEnd, shift);
  targetLine.write(nextStart, nextEnd);
  return distance(lineStart, nextStart);
}

function projectCurveToCurveTangency(
  referenceCurve: TangentCurveAccessor,
  targetCurve: TangentCurveAccessor
): number {
  const referenceCenter = referenceCurve.readCenter();
  const targetCenter = targetCurve.readCenter();
  const referenceRadius = referenceCurve.readRadius();
  const targetRadius = targetCurve.readRadius();
  const centerDelta = subtract(targetCenter, referenceCenter);
  const centerDistance = vectorLength(centerDelta);
  const direction: NumericVector =
    centerDistance <= SOLVE_EPSILON ? [1, 0] : normalize(centerDelta);
  const expectedSeparation = preferredCurveSeparation(
    centerDistance,
    referenceRadius,
    targetRadius
  );
  const nextTargetCenter = add(referenceCenter, scale(direction, expectedSeparation));
  return targetCurve.writeCenter(nextTargetCenter);
}

function preferredCurveSeparation(
  centerDistance: number,
  firstRadius: number,
  secondRadius: number
): number {
  const external = firstRadius + secondRadius;
  const internal = Math.abs(firstRadius - secondRadius);
  return Math.abs(centerDistance - external) <= Math.abs(centerDistance - internal)
    ? external
    : internal;
}

function resolveRadiusTarget(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  curveId: string
): {
  residual: (radius: number) => number;
  write: (radius: number) => number;
} {
  const entity = entityMap.get(curveId);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing curve ${curveId}`
    );
  }

  if (entity.kind === "sketch.circle") {
    return {
      residual: (radius) =>
        Math.abs(
          toFiniteNumber(entity.radius, `Sketch ${sketchId} circle ${curveId} radius`) - radius
        ),
      write: (radius) => {
        const current = toFiniteNumber(
          entity.radius,
          `Sketch ${sketchId} circle ${curveId} radius`
        );
        entity.radius = radius;
        return Math.abs(current - radius);
      },
    };
  }

  if (entity.kind === "sketch.arc") {
    const readArc = (): {
      center: NumericPoint;
      start: NumericPoint;
      end: NumericPoint;
      startVector: NumericVector;
      endVector: NumericVector;
      startRadius: number;
      endRadius: number;
    } => {
      const center = readNumericPoint(entity.center, `Sketch ${sketchId} arc ${curveId} center`);
      const start = readNumericPoint(entity.start, `Sketch ${sketchId} arc ${curveId} start`);
      const end = readNumericPoint(entity.end, `Sketch ${sketchId} arc ${curveId} end`);
      const startVector = subtract(start, center);
      const endVector = subtract(end, center);
      const startRadius = vectorLength(startVector);
      const endRadius = vectorLength(endVector);
      if (startRadius <= SOLVE_EPSILON || endRadius <= SOLVE_EPSILON) {
        throw new CompileError(
          "sketch_constraint_invalid_reference",
          `Sketch ${sketchId} radius constraint on ${curveId} requires arc endpoints away from center`
        );
      }
      return {
        center,
        start,
        end,
        startVector,
        endVector,
        startRadius,
        endRadius,
      };
    };

    return {
      residual: (radius) => {
        const arc = readArc();
        return Math.max(
          Math.abs(arc.startRadius - radius),
          Math.abs(arc.endRadius - radius)
        );
      },
      write: (radius) => {
        const arc = readArc();
        const nextStart = add(arc.center, scale(normalize(arc.startVector), radius));
        const nextEnd = add(arc.center, scale(normalize(arc.endVector), radius));
        entity.start = nextStart;
        entity.end = nextEnd;
        return Math.max(distance(arc.start, nextStart), distance(arc.end, nextEnd));
      },
    };
  }

  throw new CompileError(
    "sketch_constraint_kind_mismatch",
    `Sketch ${sketchId} radius constraint ${curveId} must reference a sketch.circle or sketch.arc`
  );
}

function collectDrivenVariables(
  entities: SketchEntity[],
  constraints: SketchConstraint[]
): ScalarVariable[] {
  const variables = collectScalarVariables(entities);
  if (variables.length === 0 || constraints.length === 0) return variables;
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const drivenHandles = collectDrivenVariableHandles(entityMap, constraints);
  if (drivenHandles.size === 0) return [];
  return variables.filter((variable) =>
    drivenHandles.has(variableHandleKey(variable.entityId, variable.handle))
  );
}

function collectDrivenVariableHandles(
  entityMap: Map<string, SketchEntity>,
  constraints: SketchConstraint[]
): Set<string> {
  const handles = new Set<string>();
  const addHandle = (entityId: string, handle: string): void => {
    if (!entityMap.has(entityId)) return;
    handles.add(variableHandleKey(entityId, handle));
  };
  const addPointRef = (ref: SketchConstraintPointRef): void => {
    const entity = entityMap.get(ref.entity);
    const handle = entity ? normalizedPointRefHandle(entity, ref.handle) : ref.handle ?? null;
    if (!handle) return;
    handles.add(variableHandleKey(ref.entity, handle));
  };
  const addTangentTargetHandles = (entityId: string): void => {
    const entity = entityMap.get(entityId);
    if (!entity) return;
    switch (entity.kind) {
      case "sketch.line":
        addHandle(entityId, "start");
        addHandle(entityId, "end");
        break;
      case "sketch.circle":
        addHandle(entityId, "center");
        addHandle(entityId, "radius");
        break;
      case "sketch.arc":
        addHandle(entityId, "center");
        addHandle(entityId, "start");
        addHandle(entityId, "end");
        break;
      default:
        break;
    }
  };
  const addConcentricTargetHandles = (entityId: string): void => {
    const entity = entityMap.get(entityId);
    if (!entity) return;
    if (entity.kind === "sketch.circle" || entity.kind === "sketch.arc") {
      addHandle(entityId, "center");
    }
  };

  for (const constraint of constraints) {
    switch (constraint.kind) {
      case "sketch.constraint.coincident":
        addPointRef(constraint.b);
        break;
      case "sketch.constraint.distance":
        addPointRef(constraint.b);
        break;
      case "sketch.constraint.pointOnLine":
        addPointRef(constraint.point);
        break;
      case "sketch.constraint.midpoint":
        addPointRef(constraint.point);
        break;
      case "sketch.constraint.radius": {
        const entity = entityMap.get(constraint.curve);
        if (entity?.kind === "sketch.circle") {
          addHandle(constraint.curve, "radius");
        } else if (entity?.kind === "sketch.arc") {
          addHandle(constraint.curve, "start");
          addHandle(constraint.curve, "end");
        }
        break;
      }
      case "sketch.constraint.fixPoint":
        addPointRef(constraint.point);
        break;
      case "sketch.constraint.tangent":
        addTangentTargetHandles(constraint.b);
        break;
      case "sketch.constraint.concentric":
        addConcentricTargetHandles(constraint.b);
        break;
      case "sketch.constraint.symmetry":
        addPointRef(constraint.b);
        break;
      case "sketch.constraint.horizontal":
      case "sketch.constraint.vertical":
      case "sketch.constraint.parallel":
      case "sketch.constraint.perpendicular":
      case "sketch.constraint.equalLength":
      case "sketch.constraint.angle":
      case "sketch.constraint.collinear":
        break;
    }
  }

  return handles;
}

function variableHandleKey(entityId: string, handle: string): string {
  return `${entityId}#${handle}`;
}

function normalizedPointRefHandle(
  entity: SketchEntity,
  handle: SketchConstraintPointRef["handle"]
): string | null {
  switch (entity.kind) {
    case "sketch.line":
      return handle === "start" || handle === "end" ? handle : null;
    case "sketch.arc":
      return handle === "start" || handle === "end"
        ? handle
        : handle === undefined || handle === "center"
          ? "center"
          : null;
    case "sketch.circle":
    case "sketch.ellipse":
    case "sketch.slot":
    case "sketch.polygon":
      return handle === undefined || handle === "center" ? "center" : null;
    case "sketch.rectangle":
      if (entity.mode === "center") {
        return handle === undefined || handle === "center" ? "center" : null;
      }
      return handle === undefined || handle === "corner" ? "corner" : null;
    case "sketch.point":
      return handle === undefined || handle === "point" ? "point" : null;
    case "sketch.spline":
      return null;
  }
}

function collectScalarVariables(entities: SketchEntity[]): ScalarVariable[] {
  const variables: ScalarVariable[] = [];
  for (const entity of entities) {
    switch (entity.kind) {
      case "sketch.line":
        pushPointVariables(variables, entity.id, "start", () => entity.start, (point) => {
          entity.start = point;
        });
        pushPointVariables(variables, entity.id, "end", () => entity.end, (point) => {
          entity.end = point;
        });
        break;
      case "sketch.arc":
        pushPointVariables(variables, entity.id, "start", () => entity.start, (point) => {
          entity.start = point;
        });
        pushPointVariables(variables, entity.id, "end", () => entity.end, (point) => {
          entity.end = point;
        });
        pushPointVariables(variables, entity.id, "center", () => entity.center, (point) => {
          entity.center = point;
        });
        break;
      case "sketch.circle":
        pushPointVariables(variables, entity.id, "center", () => entity.center, (point) => {
          entity.center = point;
        });
        variables.push({
          entityId: entity.id,
          handle: "radius",
          kind: "scalar",
          read: () => toFiniteNumber(entity.radius, `Sketch circle ${entity.id} radius`),
          write: (value) => {
            entity.radius = Math.max(SOLVE_EPSILON, value);
          },
        });
        break;
      case "sketch.ellipse":
      case "sketch.slot":
      case "sketch.polygon":
        pushPointVariables(variables, entity.id, "center", () => entity.center, (point) => {
          entity.center = point;
        });
        break;
      case "sketch.rectangle":
        if (entity.mode === "center") {
          pushPointVariables(variables, entity.id, "center", () => entity.center, (point) => {
            entity.center = point;
          });
        } else {
          pushPointVariables(variables, entity.id, "corner", () => entity.corner, (point) => {
            entity.corner = point;
          });
        }
        break;
      case "sketch.point":
        pushPointVariables(variables, entity.id, "point", () => entity.point, (point) => {
          entity.point = point;
        });
        break;
      case "sketch.spline":
        break;
    }
  }
  return variables;
}

function pushPointVariables(
  variables: ScalarVariable[],
  entityId: string,
  handle: string,
  readPoint: () => Point2D,
  writePoint: (point: Point2D) => void
): void {
  variables.push({
    entityId,
    handle,
    kind: "x",
    read: () => toFiniteNumber(readPoint()[0], `Sketch entity ${entityId} x`),
    write: (value) => {
      const point = readPoint();
      writePoint([value, point[1]]);
    },
    readPoint: () => readNumericPoint(readPoint(), `Sketch entity ${entityId}`),
  });
  variables.push({
    entityId,
    handle,
    kind: "y",
    read: () => toFiniteNumber(readPoint()[1], `Sketch entity ${entityId} y`),
    write: (value) => {
      const point = readPoint();
      writePoint([point[0], value]);
    },
    readPoint: () => readNumericPoint(readPoint(), `Sketch entity ${entityId}`),
  });
}

function resolvePointRef(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  ref: SketchConstraintPointRef
): {
  read: () => NumericPoint;
  write: (point: NumericPoint) => void;
} {
  const entity = entityMap.get(ref.entity);
  if (!entity) {
    throw new CompileError(
      "sketch_constraint_reference_missing",
      `Sketch ${sketchId} references missing entity ${ref.entity}`
    );
  }

  switch (entity.kind) {
    case "sketch.line":
      if (ref.handle === "start") {
        return pointAccessor(
          () => readNumericPoint(entity.start, `Sketch ${sketchId} line ${ref.entity} start`),
          (point) => {
            entity.start = point;
          }
        );
      }
      if (ref.handle === "end") {
        return pointAccessor(
          () => readNumericPoint(entity.end, `Sketch ${sketchId} line ${ref.entity} end`),
          (point) => {
            entity.end = point;
          }
        );
      }
      break;
    case "sketch.arc":
      if (ref.handle === "start") {
        return pointAccessor(
          () => readNumericPoint(entity.start, `Sketch ${sketchId} arc ${ref.entity} start`),
          (point) => {
            entity.start = point;
          }
        );
      }
      if (ref.handle === "end") {
        return pointAccessor(
          () => readNumericPoint(entity.end, `Sketch ${sketchId} arc ${ref.entity} end`),
          (point) => {
            entity.end = point;
          }
        );
      }
      if (ref.handle === "center" || ref.handle === undefined) {
        return pointAccessor(
          () => readNumericPoint(entity.center, `Sketch ${sketchId} arc ${ref.entity} center`),
          (point) => {
            entity.center = point;
          }
        );
      }
      break;
    case "sketch.circle":
    case "sketch.ellipse":
    case "sketch.slot":
    case "sketch.polygon":
      if (ref.handle === "center" || ref.handle === undefined) {
        return pointAccessor(
          () => readNumericPoint(entity.center, `Sketch ${sketchId} entity ${ref.entity} center`),
          (point) => {
            entity.center = point;
          }
        );
      }
      break;
    case "sketch.rectangle":
      if (entity.mode === "center" && (ref.handle === "center" || ref.handle === undefined)) {
        return pointAccessor(
          () => readNumericPoint(entity.center, `Sketch ${sketchId} rectangle ${ref.entity} center`),
          (point) => {
            entity.center = point;
          }
        );
      }
      if (entity.mode === "corner" && (ref.handle === "corner" || ref.handle === undefined)) {
        return pointAccessor(
          () => readNumericPoint(entity.corner, `Sketch ${sketchId} rectangle ${ref.entity} corner`),
          (point) => {
            entity.corner = point;
          }
        );
      }
      break;
    case "sketch.point":
      if (ref.handle === "point" || ref.handle === undefined) {
        return pointAccessor(
          () => readNumericPoint(entity.point, `Sketch ${sketchId} point ${ref.entity}`),
          (point) => {
            entity.point = point;
          }
        );
      }
      break;
    case "sketch.spline":
      break;
  }

  throw new CompileError(
    "sketch_constraint_kind_mismatch",
    `Sketch ${sketchId} ref ${ref.entity}${ref.handle ? `.${ref.handle}` : ""} is not supported`
  );
}

function pointAccessor(
  read: () => NumericPoint,
  write: (point: NumericPoint) => void
): {
  read: () => NumericPoint;
  write: (point: NumericPoint) => void;
} {
  return { read, write };
}

function readNumericPoint(point: Point2D, label: string): NumericPoint {
  return [
    toFiniteNumber(point[0], `${label} x`),
    toFiniteNumber(point[1], `${label} y`),
  ];
}

function toFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CompileError(
      "sketch_constraint_scalar_expected",
      `${label} must resolve to a finite number`
    );
  }
  return value;
}

function readPositiveRadius(value: unknown, label: string): number {
  const radius = toFiniteNumber(value, label);
  if (radius <= 0) {
    throw new CompileError(
      "sketch_constraint_scalar_positive",
      `${label} must be > 0`
    );
  }
  return radius;
}

function readAngleConstraint(value: unknown, label: string): number {
  const angle = toFiniteNumber(value, label);
  if (angle < 0 || angle > 180) {
    throw new CompileError(
      "sketch_constraint_angle_range",
      `${label} must be between 0 and 180 degrees`
    );
  }
  return angle;
}

function distance(a: NumericPoint, b: NumericPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function samePointRef(a: SketchConstraintPointRef, b: SketchConstraintPointRef): boolean {
  return a.entity === b.entity && (a.handle ?? null) === (b.handle ?? null);
}

function dedupeEntityIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function subtract(a: NumericPoint, b: NumericPoint): NumericVector {
  return [a[0] - b[0], a[1] - b[1]];
}

function add(point: NumericPoint, delta: NumericVector): NumericPoint {
  return [point[0] + delta[0], point[1] + delta[1]];
}

function scale(vector: NumericVector, scalar: number): NumericVector {
  return [vector[0] * scalar, vector[1] * scalar];
}

function dot(a: NumericVector, b: NumericVector): number {
  return a[0] * b[0] + a[1] * b[1];
}

function cross(a: NumericVector, b: NumericVector): number {
  return a[0] * b[1] - a[1] * b[0];
}

function vectorLength(vector: NumericVector): number {
  return Math.hypot(vector[0], vector[1]);
}

function rotate(vector: NumericVector, radians: number): NumericVector {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [
    vector[0] * cos - vector[1] * sin,
    vector[0] * sin + vector[1] * cos,
  ];
}

function normalize(vector: NumericVector): NumericVector {
  const length = vectorLength(vector);
  if (length <= SOLVE_EPSILON) return [1, 0];
  return [vector[0] / length, vector[1] / length];
}

function lineDirection(
  start: NumericPoint,
  end: NumericPoint,
  sketchId: string,
  constraintId: string
): NumericVector {
  const vector = subtract(end, start);
  const length = vectorLength(vector);
  if (length <= SOLVE_EPSILON) {
    throw new CompileError(
      "sketch_constraint_invalid_reference",
      `Sketch ${sketchId} constraint ${constraintId} references a zero-length line`
    );
  }
  return [vector[0] / length, vector[1] / length];
}

function targetLineLength(
  start: NumericPoint,
  end: NumericPoint,
  fallbackLength: number
): number {
  const currentLength = distance(start, end);
  if (currentLength > SOLVE_EPSILON) return currentLength;
  if (fallbackLength > SOLVE_EPSILON) return fallbackLength;
  return 1;
}

function chooseAlignedDirection(
  direction: NumericVector,
  current: NumericVector
): NumericVector {
  const positive = normalize(direction);
  const negative = scale(positive, -1);
  if (dot(current, positive) >= dot(current, negative)) return positive;
  return negative;
}

function perpendicularDirections(direction: NumericVector): [NumericVector, NumericVector] {
  const normalized = normalize(direction);
  return [
    [-normalized[1], normalized[0]],
    [normalized[1], -normalized[0]],
  ];
}

function angleDirections(direction: NumericVector, angleDeg: number): [NumericVector, NumericVector] {
  const normalized = normalize(direction);
  const radians = degToRad(angleDeg);
  return [
    normalize(rotate(normalized, radians)),
    normalize(rotate(normalized, -radians)),
  ];
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function angleBetween(a: NumericVector, b: NumericVector): number {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

function estimateRigidBodyModes(
  jacobian: number[][],
  variables: ScalarVariable[]
): number {
  if (variables.length === 0) return 0;
  const xMode = variables.map((variable) => (variable.kind === "x" ? 1 : 0));
  const yMode = variables.map((variable) => (variable.kind === "y" ? 1 : 0));
  const rotationMode = variables.map((variable) => {
    if (variable.kind === "scalar" || !variable.readPoint) return 0;
    const point = variable.readPoint();
    return variable.kind === "x" ? -point[1] : point[0];
  });
  const admissibleModes = [xMode, yMode, rotationMode].filter((mode) => {
    const modeNorm = vectorNorm(mode);
    if (modeNorm <= SOLVE_EPSILON) return false;
    const projected = matrixVectorNorm(jacobian, mode);
    return projected <= 1e-5 * Math.max(1, modeNorm);
  });
  if (admissibleModes.length === 0) return 0;
  return estimateMatrixRank(admissibleModes);
}

function matrixVectorNorm(matrix: number[][], vector: number[]): number {
  if (matrix.length === 0) return 0;
  let sum = 0;
  for (const row of matrix) {
    const value = row.reduce((acc, entry, index) => acc + entry * (vector[index] ?? 0), 0);
    sum += value * value;
  }
  return Math.sqrt(sum);
}

function vectorNorm(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum);
}

function estimateMatrixRank(matrix: number[][], relativeTolerance = 1e-6): number {
  const rows = matrix.length;
  if (rows === 0) return 0;
  const cols = matrix[0]?.length ?? 0;
  if (cols === 0) return 0;
  const working = matrix.map((row) => row.slice());
  let maxAbs = 0;
  for (const row of working) {
    for (const value of row) maxAbs = Math.max(maxAbs, Math.abs(value));
  }
  const tolerance = Math.max(1e-10, maxAbs * relativeTolerance);
  let rank = 0;
  let pivotRow = 0;

  for (let col = 0; col < cols && pivotRow < rows; col += 1) {
    let bestRow = pivotRow;
    let bestValue = Math.abs(working[pivotRow]?.[col] ?? 0);
    for (let row = pivotRow + 1; row < rows; row += 1) {
      const value = Math.abs(working[row]?.[col] ?? 0);
      if (value > bestValue) {
        bestValue = value;
        bestRow = row;
      }
    }
    if (bestValue <= tolerance) continue;
    if (bestRow !== pivotRow) {
      const temp = working[pivotRow];
      working[pivotRow] = working[bestRow] ?? [];
      working[bestRow] = temp ?? [];
    }
    const pivot = working[pivotRow]?.[col] ?? 0;
    for (let row = pivotRow + 1; row < rows; row += 1) {
      const factor = (working[row]?.[col] ?? 0) / pivot;
      if (Math.abs(factor) <= tolerance) continue;
      const rowData = working[row];
      const pivotData = working[pivotRow];
      if (!rowData || !pivotData) continue;
      for (let c = col; c < cols; c += 1) {
        rowData[c] = (rowData[c] ?? 0) - factor * (pivotData[c] ?? 0);
      }
    }
    rank += 1;
    pivotRow += 1;
  }

  return rank;
}

function chooseClosestDirection(
  candidates: [NumericVector, NumericVector],
  current: NumericVector
): NumericVector {
  if (dot(current, candidates[0]) >= dot(current, candidates[1])) {
    return candidates[0];
  }
  return candidates[1];
}
