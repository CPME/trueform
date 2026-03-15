import { CompileError } from "../errors.js";
import type { Point2D, SketchConstraintPointRef } from "../ir.js";

type NumericPoint = [number, number];
type NumericVector = [number, number];
type ScalarVariable = {
  entityId: string;
  handle: string;
  kind: "x" | "y" | "scalar";
  read: () => number;
  write: (value: number) => void;
  readPoint?: () => NumericPoint;
};

const SOLVE_EPSILON = 1e-9;

export function buildNormalMatrix(jacobian: number[][]): number[][] {
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
        if (left !== right) normal[right]![left] = (normal[right]![left] ?? 0) + contribution;
      }
    }
  }
  return normal;
}

export function buildNormalGradient(jacobian: number[][], residual: number[]): number[] {
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

export function addLevenbergRegularization(matrix: number[][], damping: number): number[][] {
  const maxDiagonal = matrix.reduce(
    (max, row, rowIndex) => Math.max(max, Math.abs(row[rowIndex] ?? 0)),
    0
  );
  const diagonalFloor = Math.max(1e-10, maxDiagonal * 1e-12);
  return matrix.map((row, rowIndex) =>
    row.map((value, colIndex) =>
      value +
      (rowIndex === colIndex
        ? damping * Math.max(diagonalFloor, Math.abs(row[rowIndex] ?? 0))
        : 0)
    )
  );
}

export function estimateVariableScales(variables: ScalarVariable[]): number[] {
  return variables.map((variable) => Math.max(1, Math.abs(variable.read())));
}

export function scaleJacobianColumns(jacobian: number[][], scales: number[]): number[][] {
  return jacobian.map((row) =>
    row.map((value, columnIndex) => value * (scales[columnIndex] ?? 1))
  );
}

export function unscaleVariableStep(step: number[], scales: number[]): number[] {
  return step.map((value, index) => value * (scales[index] ?? 1));
}

export function fallbackGradientStep(
  gradient: number[],
  normalMatrix: number[][],
  damping: number
): number[] | null {
  const step = gradient.map((value, index) => {
    const diagonal = Math.abs(normalMatrix[index]?.[index] ?? 0);
    const regularized = Math.max(1e-8, diagonal + damping);
    return -value / regularized;
  });
  return vectorNorm(step) <= SOLVE_EPSILON ? null : step;
}

export function clampVectorToTrustRadius(
  step: number[],
  trustRadius: number
): { step: number[]; clamped: boolean } {
  const norm = vectorNorm(step);
  if (norm <= trustRadius || trustRadius <= SOLVE_EPSILON) return { step, clamped: false };
  const scaleFactor = trustRadius / norm;
  return { step: step.map((value) => value * scaleFactor), clamped: true };
}

export function computeQuadraticModelReduction(
  gradient: number[],
  normalMatrix: number[][],
  step: number[]
): number {
  const linear = -vectorDot(gradient, step);
  const quadratic = 0.5 * quadraticForm(normalMatrix, step);
  return linear - quadratic;
}

export function vectorDot(left: number[], right: number[]): number {
  const size = Math.max(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < size; index += 1) sum += (left[index] ?? 0) * (right[index] ?? 0);
  return sum;
}

export function quadraticForm(matrix: number[][], vector: number[]): number {
  let sum = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    const rowData = matrix[row];
    if (!rowData) continue;
    let rowDot = 0;
    for (let col = 0; col < rowData.length; col += 1) rowDot += (rowData[col] ?? 0) * (vector[col] ?? 0);
    sum += (vector[row] ?? 0) * rowDot;
  }
  return sum;
}

export function scaleVector(values: number[], scalar: number): number[] {
  return values.map((value) => value * scalar);
}

export function solveLinearSystem(matrix: number[][], rhs: number[]): number[] | null {
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
    for (let col = pivot; col <= size; col += 1) pivotRow[col] = (pivotRow[col] ?? 0) / pivotValue;

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

export function applyVariableStep(
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

export function restoreVariableValues(variables: ScalarVariable[], values: number[]): void {
  for (let index = 0; index < variables.length; index += 1) {
    const variable = variables[index];
    if (!variable) continue;
    variable.write(values[index] ?? variable.read());
  }
}

export function maxAbsValue(values: number[]): number {
  return values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
}

export function pointAccessor(
  read: () => NumericPoint,
  write: (point: NumericPoint) => void
): { read: () => NumericPoint; write: (point: NumericPoint) => void } {
  return { read, write };
}

export function readNumericPoint(point: Point2D, label: string): NumericPoint {
  return [toFiniteNumber(point[0], `${label} x`), toFiniteNumber(point[1], `${label} y`)];
}

export function toFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new CompileError(
      "sketch_constraint_scalar_expected",
      `${label} must resolve to a finite number`
    );
  }
  return value;
}

export function readPositiveRadius(value: unknown, label: string): number {
  const radius = toFiniteNumber(value, label);
  if (radius <= 0) {
    throw new CompileError("sketch_constraint_scalar_positive", `${label} must be > 0`);
  }
  return radius;
}

export function readAngleConstraint(value: unknown, label: string): number {
  const angle = toFiniteNumber(value, label);
  if (angle < 0 || angle > 180) {
    throw new CompileError(
      "sketch_constraint_angle_range",
      `${label} must be between 0 and 180 degrees`
    );
  }
  return angle;
}

export function distance(a: NumericPoint, b: NumericPoint): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function samePointRef(a: SketchConstraintPointRef, b: SketchConstraintPointRef): boolean {
  return a.entity === b.entity && (a.handle ?? null) === (b.handle ?? null);
}

export function dedupeEntityIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function subtract(a: NumericPoint, b: NumericPoint): NumericVector {
  return [a[0] - b[0], a[1] - b[1]];
}

export function add(point: NumericPoint, delta: NumericVector): NumericPoint {
  return [point[0] + delta[0], point[1] + delta[1]];
}

export function scale(vector: NumericVector, scalar: number): NumericVector {
  return [vector[0] * scalar, vector[1] * scalar];
}

export function dot(a: NumericVector, b: NumericVector): number {
  return a[0] * b[0] + a[1] * b[1];
}

export function cross(a: NumericVector, b: NumericVector): number {
  return a[0] * b[1] - a[1] * b[0];
}

export function vectorLength(vector: NumericVector): number {
  return Math.hypot(vector[0], vector[1]);
}

export function rotate(vector: NumericVector, radians: number): NumericVector {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [vector[0] * cos - vector[1] * sin, vector[0] * sin + vector[1] * cos];
}

export function normalize(vector: NumericVector): NumericVector {
  const length = vectorLength(vector);
  if (length <= SOLVE_EPSILON) return [1, 0];
  return [vector[0] / length, vector[1] / length];
}

export function lineDirection(
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

export function targetLineLength(
  start: NumericPoint,
  end: NumericPoint,
  fallbackLength: number
): number {
  const currentLength = distance(start, end);
  if (currentLength > SOLVE_EPSILON) return currentLength;
  if (fallbackLength > SOLVE_EPSILON) return fallbackLength;
  return 1;
}

export function chooseAlignedDirection(
  direction: NumericVector,
  current: NumericVector
): NumericVector {
  const positive = normalize(direction);
  const negative = scale(positive, -1);
  return dot(current, positive) >= dot(current, negative) ? positive : negative;
}

export function perpendicularDirections(direction: NumericVector): [NumericVector, NumericVector] {
  const normalized = normalize(direction);
  return [
    [-normalized[1], normalized[0]],
    [normalized[1], -normalized[0]],
  ];
}

export function angleDirections(
  direction: NumericVector,
  angleDeg: number
): [NumericVector, NumericVector] {
  const normalized = normalize(direction);
  const radians = degToRad(angleDeg);
  return [
    normalize(rotate(normalized, radians)),
    normalize(rotate(normalized, -radians)),
  ];
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function angleBetween(a: NumericVector, b: NumericVector): number {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

export function degToRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function estimateRigidBodyModes(
  jacobian: number[][],
  variables: ScalarVariable[]
): number {
  return listAdmissibleRigidBodyModes(jacobian, variables).length;
}

export function listAdmissibleRigidBodyModes(
  jacobian: number[][],
  variables: ScalarVariable[]
): number[][] {
  if (variables.length === 0) return [];
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
  return orthonormalizeVectorBasis(admissibleModes);
}

export function matrixVectorNorm(matrix: number[][], vector: number[]): number {
  if (matrix.length === 0) return 0;
  let sum = 0;
  for (const row of matrix) {
    const value = row.reduce((acc, entry, index) => acc + entry * (vector[index] ?? 0), 0);
    sum += value * value;
  }
  return Math.sqrt(sum);
}

export function vectorNorm(values: number[]): number {
  let sum = 0;
  for (const value of values) sum += value * value;
  return Math.sqrt(sum);
}

export function estimateMatrixRank(matrix: number[][], relativeTolerance = 1e-6): number {
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
      for (let c = col; c < cols; c += 1) rowData[c] = (rowData[c] ?? 0) - factor * (pivotData[c] ?? 0);
    }
    rank += 1;
    pivotRow += 1;
  }

  return rank;
}

export function orthonormalizeVectorBasis(
  vectors: number[][],
  tolerance = 1e-8
): number[][] {
  const basis: number[][] = [];
  for (const candidate of vectors) {
    const next = candidate.slice();
    for (const existing of basis) {
      const projection = vectorDot(next, existing);
      if (Math.abs(projection) <= tolerance) continue;
      for (let index = 0; index < next.length; index += 1) {
        next[index] = (next[index] ?? 0) - projection * (existing[index] ?? 0);
      }
    }
    const norm = vectorNorm(next);
    if (norm <= tolerance) continue;
    basis.push(canonicalizeDirection(next.map((value) => value / norm), tolerance));
  }
  return basis;
}

export function canonicalizeDirection(
  values: number[],
  tolerance = 1e-8
): number[] {
  const next = values.slice();
  for (const value of next) {
    if (Math.abs(value) <= tolerance) continue;
    if (value < 0) {
      for (let index = 0; index < next.length; index += 1) {
        next[index] = -(next[index] ?? 0);
      }
    }
    break;
  }
  return next;
}

export function estimateNullspaceBasis(
  matrix: number[][],
  relativeTolerance = 1e-6
): number[][] {
  const rows = matrix.length;
  if (rows === 0) return [];
  const cols = matrix[0]?.length ?? 0;
  if (cols === 0) return [];
  const { rref, pivotColumns, freeColumns } = buildReducedRowEchelonForm(matrix, relativeTolerance);
  if (freeColumns.length === 0) return [];
  const pivotRowByColumn = new Map<number, number>();
  for (let rowIndex = 0; rowIndex < pivotColumns.length; rowIndex += 1) {
    const column = pivotColumns[rowIndex];
    if (column !== undefined) pivotRowByColumn.set(column, rowIndex);
  }
  const basis: number[][] = [];
  for (const freeColumn of freeColumns) {
    const direction = new Array(cols).fill(0);
    direction[freeColumn] = 1;
    for (const pivotColumn of pivotColumns) {
      const rowIndex = pivotRowByColumn.get(pivotColumn);
      if (rowIndex === undefined) continue;
      direction[pivotColumn] = -(rref[rowIndex]?.[freeColumn] ?? 0);
    }
    const norm = vectorNorm(direction);
    if (norm <= 1e-8) continue;
    basis.push(canonicalizeDirection(direction.map((value) => value / norm)));
  }
  return orthonormalizeVectorBasis(basis);
}

export function removeBasisProjection(
  vector: number[],
  basis: number[][]
): number[] {
  const next = vector.slice();
  for (const direction of basis) {
    const projection = vectorDot(next, direction);
    if (Math.abs(projection) <= 1e-10) continue;
    for (let index = 0; index < next.length; index += 1) {
      next[index] = (next[index] ?? 0) - projection * (direction[index] ?? 0);
    }
  }
  return next;
}

function buildReducedRowEchelonForm(
  matrix: number[][],
  relativeTolerance = 1e-6
): { rref: number[][]; pivotColumns: number[]; freeColumns: number[] } {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const working = matrix.map((row) => row.slice());
  let maxAbs = 0;
  for (const row of working) {
    for (const value of row) maxAbs = Math.max(maxAbs, Math.abs(value));
  }
  const tolerance = Math.max(1e-10, maxAbs * relativeTolerance);
  const pivotColumns: number[] = [];
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
    if (Math.abs(pivot) <= tolerance) continue;
    const pivotData = working[pivotRow];
    if (!pivotData) continue;
    for (let currentCol = col; currentCol < cols; currentCol += 1) {
      pivotData[currentCol] = (pivotData[currentCol] ?? 0) / pivot;
      if (Math.abs(pivotData[currentCol] ?? 0) <= tolerance) pivotData[currentCol] = 0;
    }
    for (let row = 0; row < rows; row += 1) {
      if (row === pivotRow) continue;
      const rowData = working[row];
      if (!rowData) continue;
      const factor = rowData[col] ?? 0;
      if (Math.abs(factor) <= tolerance) continue;
      for (let currentCol = col; currentCol < cols; currentCol += 1) {
        rowData[currentCol] = (rowData[currentCol] ?? 0) - factor * (pivotData[currentCol] ?? 0);
        if (Math.abs(rowData[currentCol] ?? 0) <= tolerance) rowData[currentCol] = 0;
      }
    }
    pivotColumns.push(col);
    pivotRow += 1;
  }

  const pivotColumnSet = new Set(pivotColumns);
  const freeColumns: number[] = [];
  for (let col = 0; col < cols; col += 1) {
    if (!pivotColumnSet.has(col)) freeColumns.push(col);
  }
  return { rref: working, pivotColumns, freeColumns };
}

export function chooseClosestDirection(
  candidates: [NumericVector, NumericVector],
  current: NumericVector
): NumericVector {
  return dot(current, candidates[0]) >= dot(current, candidates[1]) ? candidates[0] : candidates[1];
}
