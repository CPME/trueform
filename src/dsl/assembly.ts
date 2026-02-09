import type {
  AssemblyInstance,
  AssemblyMate,
  AssemblyOutput,
  AssemblyRef,
  AxisDirection,
  ID,
  IntentAssembly,
  MateConnector,
  Selector,
  Transform,
} from "../ir.js";
import { normalizeTransform } from "../transform.js";
import { compact } from "./utils.js";

export const assembly = (
  id: ID,
  instances: AssemblyInstance[],
  opts?: { mates?: AssemblyMate[]; outputs?: AssemblyOutput[] }
): IntentAssembly => ({
  id,
  instances,
  mates: opts?.mates,
  outputs: opts?.outputs,
});

export const instance = (
  id: ID,
  part: ID,
  transform?: Transform,
  tags?: string[]
): AssemblyInstance => ({
  id,
  part,
  transform,
  tags,
});

export const transform = (opts: Transform = {}): Transform => ({
  matrix: normalizeTransform(opts),
});

export const ref = (instanceId: ID, connector: ID): AssemblyRef => ({
  instance: instanceId,
  connector,
});

export const mateFixed = (a: AssemblyRef, b: AssemblyRef): AssemblyMate => ({
  kind: "mate.fixed",
  a,
  b,
});

export const mateCoaxial = (a: AssemblyRef, b: AssemblyRef): AssemblyMate => ({
  kind: "mate.coaxial",
  a,
  b,
});

export const matePlanar = (
  a: AssemblyRef,
  b: AssemblyRef,
  offset?: number
): AssemblyMate => ({
  kind: "mate.planar",
  a,
  b,
  offset,
});

export const output = (name: string, refs: AssemblyRef[]): AssemblyOutput => ({
  name,
  refs,
});

export const connector = (
  id: ID,
  origin: Selector,
  opts?: { normal?: AxisDirection; xAxis?: AxisDirection }
): MateConnector =>
  compact({
    id,
    origin,
    normal: opts?.normal,
    xAxis: opts?.xAxis,
  });
