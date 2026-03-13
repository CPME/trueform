import { CompileError } from "../errors.js";
import type { Point2D, SketchConstraint, SketchConstraintPointRef, SketchEntity } from "../ir.js";
import { pointAccessor, readNumericPoint, toFiniteNumber } from "./solver_math.js";
import type { NumericPoint } from "./solver_geometry.js";

export type ScalarVariableKind = "x" | "y" | "scalar";

export type ScalarVariable = {
  entityId: string;
  handle: string;
  kind: ScalarVariableKind;
  read: () => number;
  write: (value: number) => void;
  readPoint?: () => NumericPoint;
};

export type PointRefAccessor = {
  read: () => NumericPoint;
  write: (point: NumericPoint) => void;
};

export function collectDrivenVariables(
  entities: SketchEntity[],
  constraints: SketchConstraint[],
  solveEpsilon: number
): ScalarVariable[] {
  const variables = collectScalarVariables(entities, solveEpsilon);
  if (variables.length === 0 || constraints.length === 0) return variables;
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const drivenHandles = collectDrivenVariableHandles(entityMap, constraints);
  if (drivenHandles.size === 0) return [];
  return variables.filter((variable) =>
    drivenHandles.has(variableHandleKey(variable.entityId, variable.handle))
  );
}

export function collectDrivenVariableHandles(
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

export function variableHandleKey(entityId: string, handle: string): string {
  return `${entityId}#${handle}`;
}

export function normalizedPointRefHandle(
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

export function collectScalarVariables(
  entities: SketchEntity[],
  solveEpsilon: number
): ScalarVariable[] {
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
            entity.radius = Math.max(solveEpsilon, value);
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

export function pushPointVariables(
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

export function resolvePointRef(
  sketchId: string,
  entityMap: Map<string, SketchEntity>,
  ref: SketchConstraintPointRef
): PointRefAccessor {
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
