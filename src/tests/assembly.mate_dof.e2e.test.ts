import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { buildPart } from "../executor.js";
import { residualsForTesting, type AssemblyInstanceState } from "../assembly_solver.js";
import { MockBackend } from "../mock_backend.js";
import {
  matrixFromTranslationRotation,
  multiplyMatrices,
  transformPoint,
} from "../transform.js";
import { runTests } from "./occt_test_utils.js";
import type { AssemblyMate } from "../ir.js";
import type { ConnectorFrame } from "../connectors.js";

type FrameAxes = {
  origin: [number, number, number];
  xAxis: [number, number, number];
  yAxis: [number, number, number];
  zAxis: [number, number, number];
};

type Motion =
  | { kind: "none" }
  | { kind: "translate"; vec: [number, number, number] }
  | { kind: "rotate"; axis: "x" | "y" | "z"; angleDeg: number; about: "a" | "b" };

type MateCase = {
  name: string;
  expectedDof: number;
  rotationDeg: [number, number, number];
  desiredDelta: [number, number, number];
  mate: (a: ReturnType<typeof dsl.assemblyRef>, b: ReturnType<typeof dsl.assemblyRef>) => AssemblyMate;
  allowedMotion: Motion;
  forbiddenMotion: Motion;
};

const TRANSLATION_EPS = 1e-3;
const ROTATION_EPS = 1e-4;

const axisDelta = (axis: number, eps: number): number[] => {
  const delta = [0, 0, 0, 0, 0, 0];
  delta[axis] = eps;
  return delta;
};

const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

const rms = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v * v, 0);
  return Math.sqrt(sum / values.length);
};

const normalize = (v: [number, number, number]): [number, number, number] => {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};

const frameFrom = (transform: number[], connector: ConnectorFrame): FrameAxes => {
  const world = multiplyMatrices(transform, connector.matrix);
  return {
    origin: [world[12] ?? 0, world[13] ?? 0, world[14] ?? 0],
    xAxis: normalize([world[0] ?? 0, world[1] ?? 0, world[2] ?? 0]),
    yAxis: normalize([world[4] ?? 0, world[5] ?? 0, world[6] ?? 0]),
    zAxis: normalize([world[8] ?? 0, world[9] ?? 0, world[10] ?? 0]),
  };
};

const translationMatrix = (vec: [number, number, number]): number[] =>
  matrixFromTranslationRotation(vec, [0, 0, 0]);

const rotationMatrix = (axis: "x" | "y" | "z", angleDeg: number): number[] => {
  if (axis === "x") return matrixFromTranslationRotation([0, 0, 0], [angleDeg, 0, 0]);
  if (axis === "y") return matrixFromTranslationRotation([0, 0, 0], [0, angleDeg, 0]);
  return matrixFromTranslationRotation([0, 0, 0], [0, 0, angleDeg]);
};

const rotationAroundPoint = (
  axis: "x" | "y" | "z",
  angleDeg: number,
  point: [number, number, number]
): number[] => {
  const tNeg = translationMatrix([-point[0], -point[1], -point[2]]);
  const rot = rotationMatrix(axis, angleDeg);
  const tPos = translationMatrix(point);
  return multiplyMatrices(tPos, multiplyMatrices(rot, tNeg));
};

const applyMotion = (
  instances: AssemblyInstanceState[],
  targetId: string,
  motion: Motion,
  frames: { a: FrameAxes; b: FrameAxes }
): AssemblyInstanceState[] => {
  if (motion.kind === "none") return instances;
  const delta =
    motion.kind === "translate"
      ? translationMatrix(motion.vec)
      : rotationAroundPoint(
          motion.axis,
          motion.angleDeg,
          motion.about === "a" ? frames.a.origin : frames.b.origin
        );
  return instances.map((inst) =>
    inst.id === targetId ? { ...inst, transform: multiplyMatrices(delta, inst.transform) } : inst
  );
};

const estimateRank = (matrix: number[][], relativeTol = 1e-6): number => {
  const rows = matrix.length;
  if (rows === 0) return 0;
  const cols = matrix[0]?.length ?? 0;
  const a = matrix.map((row) => row.slice());
  let maxAbs = 0;
  for (const row of a) {
    for (const val of row) maxAbs = Math.max(maxAbs, Math.abs(val));
  }
  const tol = Math.max(1e-10, maxAbs * relativeTol);
  let rank = 0;
  let pivotRow = 0;
  for (let col = 0; col < cols && pivotRow < rows; col += 1) {
    let bestRow = pivotRow;
    let bestVal = Math.abs(a[pivotRow]?.[col] ?? 0);
    for (let row = pivotRow + 1; row < rows; row += 1) {
      const val = Math.abs(a[row]?.[col] ?? 0);
      if (val > bestVal) {
        bestVal = val;
        bestRow = row;
      }
    }
    if (bestVal <= tol) continue;
    if (bestRow !== pivotRow) {
      const tmp = a[pivotRow];
      a[pivotRow] = a[bestRow] ?? [];
      a[bestRow] = tmp ?? [];
    }
    const pivot = a[pivotRow]?.[col] ?? 0;
    for (let row = pivotRow + 1; row < rows; row += 1) {
      const factor = (a[row]?.[col] ?? 0) / pivot;
      if (Math.abs(factor) <= tol) continue;
      const rowData = a[row];
      const pivotData = a[pivotRow];
      if (!rowData || !pivotData) continue;
      for (let c = col; c < cols; c += 1) {
        rowData[c] = (rowData[c] ?? 0) - factor * (pivotData[c] ?? 0);
      }
    }
    rank += 1;
    pivotRow += 1;
  }
  return rank;
};

const buildJacobian = (
  mates: AssemblyMate[],
  instances: AssemblyInstanceState[],
  partConnectors: Map<string, Map<string, ConnectorFrame>>
): number[][] => {
  const variableInstances = instances.slice(1);
  const base = residualsForTesting(mates, instances, partConnectors);
  const cols = variableInstances.length * 6;
  const jacobian = new Array(base.length).fill(0).map(() => new Array(cols).fill(0));

  for (const [instIndex, inst] of variableInstances.entries()) {
    for (let axis = 0; axis < 6; axis += 1) {
      const eps = axis < 3 ? TRANSLATION_EPS : ROTATION_EPS;
      const [dx = 0, dy = 0, dz = 0, drx = 0, dry = 0, drz = 0] = axisDelta(axis, eps);
      const deltaMatrix = matrixFromTranslationRotation(
        [dx, dy, dz],
        [radToDeg(drx), radToDeg(dry), radToDeg(drz)]
      );
      const perturbed = instances.map((current) =>
        current.id === inst.id
          ? { ...current, transform: multiplyMatrices(deltaMatrix, current.transform) }
          : current
      );
      const next = residualsForTesting(mates, perturbed, partConnectors);
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
  return jacobian;
};

const translationForDelta = (
  rotationDeg: [number, number, number],
  desiredDelta: [number, number, number],
  origin: [number, number, number]
): [number, number, number] => {
  const rotationOnly = matrixFromTranslationRotation([0, 0, 0], rotationDeg);
  const rotatedOrigin = transformPoint(rotationOnly, origin);
  return [
    desiredDelta[0] + origin[0] - rotatedOrigin[0],
    desiredDelta[1] + origin[1] - rotatedOrigin[1],
    desiredDelta[2] + origin[2] - rotatedOrigin[2],
  ];
};

const makeInstances = (
  partId: string,
  rotationDeg: [number, number, number],
  desiredDelta: [number, number, number],
  origin: [number, number, number]
): AssemblyInstanceState[] => {
  const translation = translationForDelta(rotationDeg, desiredDelta, origin);
  return [
    {
      id: "inst-a",
      part: partId,
      transform: matrixFromTranslationRotation(),
    },
    {
      id: "inst-b",
      part: partId,
      transform: matrixFromTranslationRotation(translation, rotationDeg),
    },
  ];
};

const backend = new MockBackend();
const part = dsl.part(
  "plate",
  [dsl.extrude("base", dsl.profileRect(2, 3), 5, "body:main")],
  {
    connectors: [
      dsl.mateConnector(
        "conn-top",
        dsl.selectorFace([dsl.predNormal("+Z"), dsl.predCreatedBy("base")])
      ),
    ],
  }
);
const built = buildPart(part, backend);
const connector = built.connectors.get("conn-top");
assert.ok(connector);

const partConnectors = new Map([[built.partId, built.connectors]]);
const refA = dsl.assemblyRef("inst-a", "conn-top");
const refB = dsl.assemblyRef("inst-b", "conn-top");

const offsetPlanar = 3;
const offsetHinge = 4;
const offsetInsert = 2;
const distanceValue = 5;
const angleValue = 60;
const allowedTranslate = 0.2;
const allowedRotate = 15;
const forbiddenRotate = 5;

const mateCases: MateCase[] = [
  {
    name: "mate.fixed",
    expectedDof: 0,
    rotationDeg: [0, 0, 0],
    desiredDelta: [0, 0, 0],
    mate: (a, b) => dsl.mateFixed(a, b),
    allowedMotion: { kind: "none" },
    forbiddenMotion: { kind: "translate", vec: [allowedTranslate, 0, 0] },
  },
  {
    name: "mate.coaxial",
    expectedDof: 2,
    rotationDeg: [0, 0, 0],
    desiredDelta: [0, 0, 7],
    mate: (a, b) => dsl.mateCoaxial(a, b),
    allowedMotion: { kind: "translate", vec: [0, 0, allowedTranslate] },
    forbiddenMotion: { kind: "translate", vec: [allowedTranslate, 0, 0] },
  },
  {
    name: "mate.planar",
    expectedDof: 3,
    rotationDeg: [0, 0, 0],
    desiredDelta: [0, 0, offsetPlanar],
    mate: (a, b) => dsl.matePlanar(a, b, offsetPlanar),
    allowedMotion: { kind: "translate", vec: [allowedTranslate, 0, 0] },
    forbiddenMotion: { kind: "translate", vec: [0, 0, allowedTranslate] },
  },
  {
    name: "mate.distance",
    expectedDof: 5,
    rotationDeg: [0, 0, 0],
    desiredDelta: [distanceValue, 0, 0],
    mate: (a, b) => dsl.mateDistance(a, b, distanceValue),
    allowedMotion: { kind: "rotate", axis: "z", angleDeg: allowedRotate, about: "a" },
    forbiddenMotion: { kind: "translate", vec: [0, 0, allowedTranslate] },
  },
  {
    name: "mate.angle",
    expectedDof: 5,
    rotationDeg: [angleValue, 0, 0],
    desiredDelta: [0, 0, 0],
    mate: (a, b) => dsl.mateAngle(a, b, angleValue),
    allowedMotion: { kind: "rotate", axis: "z", angleDeg: allowedRotate, about: "b" },
    forbiddenMotion: { kind: "rotate", axis: "x", angleDeg: forbiddenRotate, about: "b" },
  },
  {
    name: "mate.parallel",
    expectedDof: 4,
    rotationDeg: [0, 0, 0],
    desiredDelta: [1, 2, -3],
    mate: (a, b) => dsl.mateParallel(a, b),
    allowedMotion: { kind: "translate", vec: [allowedTranslate, 0, 0] },
    forbiddenMotion: { kind: "rotate", axis: "x", angleDeg: forbiddenRotate, about: "b" },
  },
  {
    name: "mate.perpendicular",
    expectedDof: 5,
    rotationDeg: [90, 0, 0],
    desiredDelta: [0, 0, 0],
    mate: (a, b) => dsl.matePerpendicular(a, b),
    allowedMotion: { kind: "rotate", axis: "z", angleDeg: allowedRotate, about: "b" },
    forbiddenMotion: { kind: "rotate", axis: "x", angleDeg: forbiddenRotate, about: "b" },
  },
  {
    name: "mate.insert",
    expectedDof: 1,
    rotationDeg: [180, 0, 0],
    desiredDelta: [0, 0, offsetInsert],
    mate: (a, b) => dsl.mateInsert(a, b, offsetInsert),
    allowedMotion: { kind: "rotate", axis: "z", angleDeg: allowedRotate, about: "a" },
    forbiddenMotion: { kind: "translate", vec: [allowedTranslate, 0, 0] },
  },
  {
    name: "mate.slider",
    expectedDof: 1,
    rotationDeg: [0, 0, 0],
    desiredDelta: [0, 0, 6],
    mate: (a, b) => dsl.mateSlider(a, b),
    allowedMotion: { kind: "translate", vec: [0, 0, allowedTranslate] },
    forbiddenMotion: { kind: "rotate", axis: "x", angleDeg: forbiddenRotate, about: "b" },
  },
  {
    name: "mate.hinge",
    expectedDof: 1,
    rotationDeg: [0, 0, 0],
    desiredDelta: [0, 0, offsetHinge],
    mate: (a, b) => dsl.mateHinge(a, b, offsetHinge),
    allowedMotion: { kind: "rotate", axis: "z", angleDeg: allowedRotate, about: "a" },
    forbiddenMotion: { kind: "translate", vec: [allowedTranslate, 0, 0] },
  },
];

const residualRms = (
  mates: AssemblyMate[],
  instances: AssemblyInstanceState[],
  connectors: Map<string, Map<string, ConnectorFrame>>
): number => rms(residualsForTesting(mates, instances, connectors));

const dofTests = mateCases.map((mateCase) => ({
  name: `assembly: ${mateCase.name} dof matches expected`,
  fn: async () => {
    const instances = makeInstances(
      built.partId,
      mateCase.rotationDeg,
      mateCase.desiredDelta,
      connector!.origin
    );
    const mates = [mateCase.mate(refA, refB)];
    const baseResidual = residualRms(mates, instances, partConnectors);
    assert.ok(baseResidual < 1e-6, `${mateCase.name} residual too large`);
    const jacobian = buildJacobian(mates, instances, partConnectors);
    const rank = estimateRank(jacobian);
    const columns = jacobian[0]?.length ?? 0;
    const dof = columns - rank;
    assert.equal(
      dof,
      mateCase.expectedDof,
      `${mateCase.name} expected dof ${mateCase.expectedDof}, got ${dof}`
    );
  },
}));

const motionTests = mateCases.map((mateCase) => ({
  name: `assembly: ${mateCase.name} allows expected motion`,
  fn: async () => {
    const instances = makeInstances(
      built.partId,
      mateCase.rotationDeg,
      mateCase.desiredDelta,
      connector!.origin
    );
    const mates = [mateCase.mate(refA, refB)];
    const baseResidual = residualRms(mates, instances, partConnectors);
    assert.ok(baseResidual < 1e-6, `${mateCase.name} residual too large`);
    const instA = instances[0];
    const instB = instances[1];
    if (!instA || !instB) {
      throw new Error("missing assembly instances for mate DOF test");
    }
    const frames = {
      a: frameFrom(instA.transform, connector!),
      b: frameFrom(instB.transform, connector!),
    };
    const allowedInstances = applyMotion(instances, "inst-b", mateCase.allowedMotion, frames);
    const allowedResidual = residualRms(mates, allowedInstances, partConnectors);
    assert.ok(
      allowedResidual < 1e-6,
      `${mateCase.name} allowed motion residual ${allowedResidual} too large`
    );
    const forbiddenInstances = applyMotion(instances, "inst-b", mateCase.forbiddenMotion, frames);
    const forbiddenResidual = residualRms(mates, forbiddenInstances, partConnectors);
    assert.ok(
      forbiddenResidual > 1e-3,
      `${mateCase.name} forbidden motion residual ${forbiddenResidual} too small`
    );
  },
}));

const tests = [...dofTests, ...motionTests];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
