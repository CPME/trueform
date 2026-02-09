import type { AssemblyMate, ID, IntentAssembly } from "./ir.js";
import type { BuildResult } from "./executor.js";
import type { ConnectorFrame } from "./connectors.js";
import { Matrix4, matrixFromTranslationRotation, multiplyMatrices, normalizeTransform } from "./transform.js";

export type AssemblySolveOptions = {
  maxIterations?: number;
  tolerance?: number;
  damping?: number;
  translationEps?: number;
  rotationEps?: number;
};

export type AssemblyInstanceState = {
  id: ID;
  part: ID;
  transform: Matrix4;
};

export type AssemblySolveResult = {
  assemblyId: ID;
  instances: AssemblyInstanceState[];
  converged: boolean;
  iterations: number;
  residual: number;
};

export function buildAssembly(
  assembly: IntentAssembly,
  parts: BuildResult[],
  options?: AssemblySolveOptions
): AssemblySolveResult {
  const connectors = new Map<ID, Map<ID, ConnectorFrame>>();
  for (const part of parts) {
    connectors.set(part.partId, part.connectors);
  }
  return solveAssembly(assembly, connectors, options);
}

export function solveAssembly(
  assembly: IntentAssembly,
  partConnectors: Map<ID, Map<ID, ConnectorFrame>>,
  options: AssemblySolveOptions = {}
): AssemblySolveResult {
  const instances = assembly.instances.map((instance) => ({
    id: instance.id,
    part: instance.part,
    transform: normalizeTransform(instance.transform),
  }));
  if (instances.length === 0) {
    return {
      assemblyId: assembly.id,
      instances: [],
      converged: true,
      iterations: 0,
      residual: 0,
    };
  }

  const fixed = instances[0];
  if (!fixed) {
    return {
      assemblyId: assembly.id,
      instances: [],
      converged: true,
      iterations: 0,
      residual: 0,
    };
  }
  const fixedId = fixed.id;
  const variableInstances = instances.filter((inst) => inst.id !== fixedId);
  const variableIndex = new Map<ID, number>();
  for (const [i, inst] of variableInstances.entries()) {
    variableIndex.set(inst.id, i);
  }

  const maxIterations = options.maxIterations ?? 40;
  const tolerance = options.tolerance ?? 1e-4;
  const damping = options.damping ?? 1e-6;
  const translationEps = options.translationEps ?? 1e-3;
  const rotationEps = options.rotationEps ?? 1e-4;

  let residual = Infinity;
  let converged = false;
  let prevResidual = Infinity;
  let stallCount = 0;

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const base = residualsFor(assembly.mates ?? [], instances, partConnectors);
    if (!base.every((value) => Number.isFinite(value))) {
      return {
        assemblyId: assembly.id,
        instances,
        converged: false,
        iterations: iter,
        residual: Infinity,
      };
    }
    residual = rms(base);
    if (!Number.isFinite(residual)) {
      return {
        assemblyId: assembly.id,
        instances,
        converged: false,
        iterations: iter,
        residual: Infinity,
      };
    }
    if (residual <= tolerance) {
      converged = true;
      return {
        assemblyId: assembly.id,
        instances,
        converged,
        iterations: iter,
        residual,
      };
    }

    const dof = variableInstances.length * 6;
    if (dof === 0) {
      return {
        assemblyId: assembly.id,
        instances,
        converged: false,
        iterations: iter,
        residual,
      };
    }

    const jacobian = new Array(base.length).fill(0).map(() => new Array(dof).fill(0));

    for (const inst of variableInstances) {
      const instIndex = variableIndex.get(inst.id);
      if (instIndex === undefined) continue;
      for (let axis = 0; axis < 6; axis += 1) {
        const eps = axis < 3 ? translationEps : rotationEps;
        const delta = axisDelta(axis, eps);
        const [dx = 0, dy = 0, dz = 0, drx = 0, dry = 0, drz = 0] = delta;
        const deltaMatrix = matrixFromTranslationRotation(
          [dx, dy, dz],
          [radToDeg(drx), radToDeg(dry), radToDeg(drz)]
        );
        const perturbed = instances.map((current) =>
          current.id === inst.id
            ? { ...current, transform: multiplyMatrices(deltaMatrix, current.transform) }
            : current
        );
        const next = residualsFor(assembly.mates ?? [], perturbed, partConnectors);
        const col = instIndex * 6 + axis;
        for (let row = 0; row < base.length; row += 1) {
          const nextVal = next[row] ?? 0;
          const baseVal = base[row] ?? 0;
          const rowData = jacobian[row];
          if (!rowData) continue;
          rowData[col] = (nextVal - baseVal) / eps;
        }
      }
    }

    const step = solveDampedLeastSquares(jacobian, base, damping);
    const stepNorm = Math.sqrt(step.reduce((acc, v) => acc + v * v, 0));
    if (!Number.isFinite(stepNorm) || stepNorm < 1e-10) {
      return {
        assemblyId: assembly.id,
        instances,
        converged: false,
        iterations: iter,
        residual,
      };
    }
    for (const inst of variableInstances) {
      const instIndex = variableIndex.get(inst.id);
      if (instIndex === undefined) continue;
      const offset = instIndex * 6;
      const delta = step.slice(offset, offset + 6);
      const [dx = 0, dy = 0, dz = 0, drx = 0, dry = 0, drz = 0] = delta;
      const deltaMatrix = matrixFromTranslationRotation(
        [dx, dy, dz],
        [radToDeg(drx), radToDeg(dry), radToDeg(drz)]
      );
      inst.transform = multiplyMatrices(deltaMatrix, inst.transform);
    }

    if (prevResidual < Infinity) {
      const improvement = prevResidual - residual;
      if (improvement < Math.max(tolerance * 0.1, 1e-8)) {
        stallCount += 1;
      } else {
        stallCount = 0;
      }
      if (stallCount >= 3) {
        return {
          assemblyId: assembly.id,
          instances,
          converged: false,
          iterations: iter,
          residual,
        };
      }
    }
    prevResidual = residual;
  }

  return {
    assemblyId: assembly.id,
    instances,
    converged,
    iterations: maxIterations,
    residual,
  };
}

// Constraint equations (aFrame vs bFrame, with d = b.origin - a.origin):
// - mate.fixed:
//   d = 0
//   cross(a.xAxis, b.xAxis) = 0, cross(a.yAxis, b.yAxis) = 0, cross(a.zAxis, b.zAxis) = 0
// - mate.coaxial:
//   cross(a.zAxis, b.zAxis) = 0
//   cross(d, a.zAxis) = 0
// - mate.planar (offset along a.zAxis):
//   cross(a.zAxis, b.zAxis) = 0
//   dot(d, a.zAxis) - offset = 0
// - mate.distance (origin distance):
//   |d| - distance = 0
// - mate.angle (degrees, between z axes):
//   dot(a.zAxis, b.zAxis) - cos(angle) = 0
// - mate.parallel:
//   cross(a.zAxis, b.zAxis) = 0
// - mate.perpendicular:
//   dot(a.zAxis, b.zAxis) = 0
// - mate.insert (coaxial + face-to-face, offset along a.zAxis):
//   cross(a.zAxis, b.zAxis) = 0
//   dot(a.zAxis, b.zAxis) + 1 = 0
//   cross(d, a.zAxis) = 0
//   dot(d, a.zAxis) - offset = 0
// - mate.slider (translation along a.zAxis allowed):
//   cross(d, a.zAxis) = 0
//   cross(a.xAxis, b.xAxis) = 0, cross(a.yAxis, b.yAxis) = 0, cross(a.zAxis, b.zAxis) = 0
// - mate.hinge (rotation about a.zAxis allowed):
//   cross(a.zAxis, b.zAxis) = 0
//   cross(d, a.zAxis) = 0
//   dot(d, a.zAxis) - offset = 0
function residualsFor(
  mates: AssemblyMate[],
  instances: AssemblyInstanceState[],
  partConnectors: Map<ID, Map<ID, ConnectorFrame>>
): number[] {
  const byId = new Map<ID, AssemblyInstanceState>(instances.map((inst) => [inst.id, inst]));
  const residuals: number[] = [];
  for (const mate of mates) {
    const a = byId.get(mate.a.instance);
    const b = byId.get(mate.b.instance);
    if (!a || !b) {
      throw new Error(`Assembly mate references missing instance`);
    }
    const aFrame = resolveFrame(a, mate.a.connector, partConnectors);
    const bFrame = resolveFrame(b, mate.b.connector, partConnectors);
    const delta = vecSub(bFrame.origin, aFrame.origin);
    if (mate.kind === "mate.fixed") {
      residuals.push(...delta);
      residuals.push(...orientationError(aFrame, bFrame));
      continue;
    }
    if (mate.kind === "mate.planar") {
      residuals.push(...cross(aFrame.zAxis, bFrame.zAxis));
      const offset = mate.offset ?? 0;
      residuals.push(dot(delta, aFrame.zAxis) - offset);
      continue;
    }
    if (mate.kind === "mate.coaxial") {
      residuals.push(...cross(aFrame.zAxis, bFrame.zAxis));
      residuals.push(...cross(delta, aFrame.zAxis));
      continue;
    }
    if (mate.kind === "mate.distance") {
      const distance = mate.distance ?? 0;
      residuals.push(length(delta) - distance);
      continue;
    }
    if (mate.kind === "mate.angle") {
      const angle = mate.angle ?? 0;
      const cos = Math.cos(degToRad(angle));
      residuals.push(dot(aFrame.zAxis, bFrame.zAxis) - cos);
      continue;
    }
    if (mate.kind === "mate.parallel") {
      residuals.push(...cross(aFrame.zAxis, bFrame.zAxis));
      continue;
    }
    if (mate.kind === "mate.perpendicular") {
      residuals.push(dot(aFrame.zAxis, bFrame.zAxis));
      continue;
    }
    if (mate.kind === "mate.insert") {
      const offset = mate.offset ?? 0;
      residuals.push(...cross(aFrame.zAxis, bFrame.zAxis));
      residuals.push(dot(aFrame.zAxis, bFrame.zAxis) + 1);
      residuals.push(...cross(delta, aFrame.zAxis));
      residuals.push(dot(delta, aFrame.zAxis) - offset);
      continue;
    }
    if (mate.kind === "mate.slider") {
      residuals.push(...cross(delta, aFrame.zAxis));
      residuals.push(...orientationError(aFrame, bFrame));
      continue;
    }
    if (mate.kind === "mate.hinge") {
      const offset = mate.offset ?? 0;
      residuals.push(...cross(aFrame.zAxis, bFrame.zAxis));
      residuals.push(...cross(delta, aFrame.zAxis));
      residuals.push(dot(delta, aFrame.zAxis) - offset);
      continue;
    }
  }
  return residuals;
}

function resolveFrame(
  instance: AssemblyInstanceState,
  connectorId: ID,
  partConnectors: Map<ID, Map<ID, ConnectorFrame>>
): FrameAxes {
  const connectors = partConnectors.get(instance.part);
  if (!connectors) {
    throw new Error(`Missing connectors for part ${instance.part}`);
  }
  const connector = connectors.get(connectorId);
  if (!connector) {
    throw new Error(`Missing connector ${connectorId} on part ${instance.part}`);
  }
  const world = multiplyMatrices(instance.transform, connector.matrix as Matrix4);
  const origin: [number, number, number] = [
    world[12] ?? 0,
    world[13] ?? 0,
    world[14] ?? 0,
  ];
  return {
    origin,
    xAxis: normalize([world[0] ?? 0, world[1] ?? 0, world[2] ?? 0]),
    yAxis: normalize([world[4] ?? 0, world[5] ?? 0, world[6] ?? 0]),
    zAxis: normalize([world[8] ?? 0, world[9] ?? 0, world[10] ?? 0]),
  };
}

function orientationError(a: FrameAxes, b: FrameAxes): [number, number, number] {
  const ex = cross(a.xAxis, b.xAxis);
  const ey = cross(a.yAxis, b.yAxis);
  const ez = cross(a.zAxis, b.zAxis);
  return [
    (ex[0] + ey[0] + ez[0]) / 2,
    (ex[1] + ey[1] + ez[1]) / 2,
    (ex[2] + ey[2] + ez[2]) / 2,
  ];
}

function solveDampedLeastSquares(
  jacobian: number[][],
  residuals: number[],
  damping: number
): number[] {
  const m = jacobian.length;
  const n = jacobian[0]?.length ?? 0;
  const jt = transpose(jacobian);
  const jtJ = multiply(jt, jacobian);
  const jtr = multiplyVector(jt, residuals);

  for (let i = 0; i < n; i += 1) {
    const row = jtJ[i];
    if (!row) continue;
    row[i] = (row[i] ?? 0) + damping;
  }

  const rhs = jtr.map((v) => -v);
  return solveLinear(jtJ, rhs);
}

function solveLinear(matrix: number[][], vector: number[]): number[] {
  const n = vector.length;
  const a = matrix.map((row) => row.slice());
  const b = vector.slice();

  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    for (let row = i + 1; row < n; row += 1) {
      const candidate = a[row];
      const pivotRow = a[pivot];
      if (!candidate || !pivotRow) continue;
      if (Math.abs(candidate[i] ?? 0) > Math.abs(pivotRow[i] ?? 0)) pivot = row;
    }
    const pivotRow = a[pivot];
    if (!pivotRow || Math.abs(pivotRow[i] ?? 0) < 1e-12) {
      return new Array(n).fill(0);
    }
    if (pivot !== i) {
      const rowI = a[i];
      const rowP = a[pivot];
      if (!rowI || !rowP) {
        return new Array(n).fill(0);
      }
      a[i] = rowP;
      a[pivot] = rowI;
      const bi = b[i] ?? 0;
      const bp = b[pivot] ?? 0;
      b[i] = bp;
      b[pivot] = bi;
    }

    const diag = a[i]?.[i];
    if (!diag) {
      return new Array(n).fill(0);
    }
    for (let col = i; col < n; col += 1) {
      const rowI = a[i];
      if (!rowI) continue;
      rowI[col] = (rowI[col] ?? 0) / diag;
    }
    b[i] = (b[i] ?? 0) / diag;

    for (let row = 0; row < n; row += 1) {
      if (row === i) continue;
      const factor = a[row]?.[i] ?? 0;
      if (factor === 0) continue;
      for (let col = i; col < n; col += 1) {
        const rowR = a[row];
        const rowI = a[i];
        if (!rowR || !rowI) continue;
        rowR[col] = (rowR[col] ?? 0) - factor * (rowI[col] ?? 0);
      }
      b[row] = (b[row] ?? 0) - factor * (b[i] ?? 0);
    }
  }

  return b;
}

function transpose(matrix: number[][]): number[][] {
  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;
  const out: number[][] = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const row = matrix[r];
      const col = out[c];
      if (!col) continue;
      col[r] = row?.[c] ?? 0;
    }
  }
  return out;
}

function multiply(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0]?.length ?? 0;
  const inner = b.length;
  const out: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      let sum = 0;
      for (let k = 0; k < inner; k += 1) {
        const av = a[r]?.[k] ?? 0;
        const bv = b[k]?.[c] ?? 0;
        sum += av * bv;
      }
      const row = out[r];
      if (!row) continue;
      row[c] = sum;
    }
  }
  return out;
}

function multiplyVector(matrix: number[][], vector: number[]): number[] {
  return matrix.map((row) =>
    row.reduce((sum, val, idx) => sum + val * (vector[idx] ?? 0), 0)
  );
}

function axisDelta(axis: number, eps: number): number[] {
  const delta = [0, 0, 0, 0, 0, 0];
  delta[axis] = eps;
  return delta;
}

function rms(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(sum / values.length);
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

type FrameAxes = {
  origin: [number, number, number];
  xAxis: [number, number, number];
  yAxis: [number, number, number];
  zAxis: [number, number, number];
};

function vecSub(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function length(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
