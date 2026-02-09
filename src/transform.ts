import type { Transform } from "./ir.js";

export type Matrix4 = number[];

const IDENTITY_MATRIX: Matrix4 = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export function identityMatrix(): Matrix4 {
  return IDENTITY_MATRIX.slice();
}

export function normalizeMatrix(matrix: number[] | undefined): Matrix4 {
  if (!matrix) return identityMatrix();
  if (!Array.isArray(matrix) || matrix.length !== 16) {
    throw new Error("Transform matrix must be length 16");
  }
  return matrix.slice();
}

export function matrixFromTranslationRotation(
  translation: [number, number, number] = [0, 0, 0],
  rotationDeg: [number, number, number] = [0, 0, 0]
): Matrix4 {
  const [tx = 0, ty = 0, tz = 0] = translation;
  const rx = ((rotationDeg[0] ?? 0) * Math.PI) / 180;
  const ry = ((rotationDeg[1] ?? 0) * Math.PI) / 180;
  const rz = ((rotationDeg[2] ?? 0) * Math.PI) / 180;

  const sx = Math.sin(rx);
  const cx = Math.cos(rx);
  const sy = Math.sin(ry);
  const cy = Math.cos(ry);
  const sz = Math.sin(rz);
  const cz = Math.cos(rz);

  // Rotation order: X then Y then Z (Rz * Ry * Rx).
  const m00 = cz * cy;
  const m01 = cz * sy * sx - sz * cx;
  const m02 = cz * sy * cx + sz * sx;
  const m10 = sz * cy;
  const m11 = sz * sy * sx + cz * cx;
  const m12 = sz * sy * cx - cz * sx;
  const m20 = -sy;
  const m21 = cy * sx;
  const m22 = cy * cx;

  return [
    m00, m10, m20, 0,
    m01, m11, m21, 0,
    m02, m12, m22, 0,
    tx, ty, tz, 1,
  ];
}

export function normalizeTransform(transform?: Transform): Matrix4 {
  if (!transform) return identityMatrix();
  if (transform.matrix) {
    return normalizeMatrix(transform.matrix);
  }
  if (!transform.translation && !transform.rotation) {
    return identityMatrix();
  }
  return matrixFromTranslationRotation(
    transform.translation ?? [0, 0, 0],
    transform.rotation ?? [0, 0, 0]
  );
}

export function multiplyMatrices(a: Matrix4, b: Matrix4): Matrix4 {
  const out = new Array(16).fill(0);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        const av = a[k * 4 + row] ?? 0;
        const bv = b[col * 4 + k] ?? 0;
        sum += av * bv;
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as Matrix4;
}

export function transformPoint(
  matrix: Matrix4,
  point: [number, number, number]
): [number, number, number] {
  const [x, y, z] = point;
  return [
    (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z + (matrix[12] ?? 0),
    (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z + (matrix[13] ?? 0),
    (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z + (matrix[14] ?? 0),
  ];
}

export function transformDirection(
  matrix: Matrix4,
  dir: [number, number, number]
): [number, number, number] {
  const [x, y, z] = dir;
  return [
    (matrix[0] ?? 0) * x + (matrix[4] ?? 0) * y + (matrix[8] ?? 0) * z,
    (matrix[1] ?? 0) * x + (matrix[5] ?? 0) * y + (matrix[9] ?? 0) * z,
    (matrix[2] ?? 0) * x + (matrix[6] ?? 0) * y + (matrix[10] ?? 0) * z,
  ];
}
