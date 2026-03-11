import type { AxisDirection } from "../ir.js";

export function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`OCCT backend: ${label} must be a number`);
  }
  return value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function axisVector(dir: AxisDirection): [number, number, number] {
  switch (dir) {
    case "+X":
      return [1, 0, 0];
    case "-X":
      return [-1, 0, 0];
    case "+Y":
      return [0, 1, 0];
    case "-Y":
      return [0, -1, 0];
    case "+Z":
      return [0, 0, 1];
    case "-Z":
      return [0, 0, -1];
  }
  throw new Error(`OCCT backend: invalid axis direction ${dir}`);
}

export function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(
  a: [number, number, number],
  b: [number, number, number]
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vecLength(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function normalizeVector(vec: [number, number, number]): [number, number, number] {
  const [x, y, z] = vec;
  const len = Math.sqrt(x * x + y * y + z * z);
  if (!Number.isFinite(len) || len === 0) return [0, 0, 0];
  return [x / len, y / len, z / len];
}

export function isFiniteVec(vec: [number, number, number]): boolean {
  return vecLength(vec) > 0 && vec.every((value) => Number.isFinite(value));
}

export function rotateAroundAxis(
  vec: [number, number, number],
  axis: [number, number, number],
  angle: number
): [number, number, number] {
  const n = normalizeVector(axis);
  if (!isFiniteVec(n)) return vec;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const crossTerm = cross(n, vec);
  const dotTerm = dot(n, vec);
  return [
    vec[0] * cos + crossTerm[0] * sin + n[0] * dotTerm * (1 - cos),
    vec[1] * cos + crossTerm[1] * sin + n[1] * dotTerm * (1 - cos),
    vec[2] * cos + crossTerm[2] * sin + n[2] * dotTerm * (1 - cos),
  ];
}

export function axisDirectionFromVector(
  vec: [number, number, number]
): AxisDirection | undefined {
  const [x, y, z] = vec;
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  const max = Math.max(ax, ay, az);
  if (max < 0.5) return undefined;
  if (max === ax) return x >= 0 ? "+X" : "-X";
  if (max === ay) return y >= 0 ? "+Y" : "-Y";
  return z >= 0 ? "+Z" : "-Z";
}
