import { AxisDirection, ID, MateConnector, Selector } from "./dsl.js";
import { KernelResult } from "./backend.js";
import { resolveSelector, type Selection } from "./selectors.js";

export type ConnectorFrame = {
  id: ID;
  origin: [number, number, number];
  xAxis: [number, number, number];
  yAxis: [number, number, number];
  zAxis: [number, number, number];
  matrix: number[];
};

export function resolveConnectors(
  connectors: MateConnector[] | undefined,
  upstream: KernelResult
): Map<ID, ConnectorFrame> {
  const resolved = new Map<ID, ConnectorFrame>();
  if (!connectors || connectors.length === 0) return resolved;

  const ctx = toResolutionContext(upstream);
  for (const connector of connectors) {
    const selection = resolveSelector(connector.origin, ctx);
    const origin = selectionCenter(selection);
    const normal = resolveNormal(connector, selection);
    const zAxis = normalize(normal);
    const xAxis = resolveXAxis(connector, zAxis);
    const yAxis = normalize(cross(zAxis, xAxis));
    const orthoX = normalize(cross(yAxis, zAxis));
    const matrix = frameToMatrix(origin, orthoX, yAxis, zAxis);
    resolved.set(connector.id, {
      id: connector.id,
      origin,
      xAxis: orthoX,
      yAxis,
      zAxis,
      matrix,
    });
  }
  return resolved;
}

function toResolutionContext(upstream: KernelResult) {
  const named = new Map<string, Selection>();
  for (const [key, obj] of upstream.outputs) {
    if (obj.kind === "face" || obj.kind === "edge" || obj.kind === "solid") {
      named.set(key, { id: obj.id, kind: obj.kind, meta: obj.meta });
    }
  }
  return { selections: upstream.selections, named };
}

function selectionCenter(selection: Selection): [number, number, number] {
  const value = selection.meta["center"];
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => typeof entry !== "number")
  ) {
    throw new Error("Connector origin requires selection center metadata");
  }
  return value as [number, number, number];
}

function resolveNormal(
  connector: MateConnector,
  selection: Selection
): [number, number, number] {
  if (connector.normal) return axisVector(connector.normal);
  const vec = selection.meta["normalVec"];
  if (
    Array.isArray(vec) &&
    vec.length === 3 &&
    vec.every((entry) => typeof entry === "number")
  ) {
    return vec as [number, number, number];
  }
  const axis = selection.meta["normal"];
  if (typeof axis === "string") {
    return axisVector(axis as AxisDirection);
  }
  throw new Error("Connector normal requires face normal metadata");
}

function resolveXAxis(
  connector: MateConnector,
  zAxis: [number, number, number]
): [number, number, number] {
  if (connector.xAxis) return axisVector(connector.xAxis);
  const ref: [number, number, number] =
    Math.abs(dot(zAxis, [1, 0, 0])) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  return normalize(cross(ref, zAxis));
}

function frameToMatrix(
  origin: [number, number, number],
  xAxis: [number, number, number],
  yAxis: [number, number, number],
  zAxis: [number, number, number]
): number[] {
  return [
    xAxis[0], xAxis[1], xAxis[2], 0,
    yAxis[0], yAxis[1], yAxis[2], 0,
    zAxis[0], zAxis[1], zAxis[2], 0,
    origin[0], origin[1], origin[2], 1,
  ];
}

function axisVector(dir: AxisDirection): [number, number, number] {
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
