import type { ExecuteInput, KernelObject, KernelResult, KernelSelection } from "../backend.js";
import type { PatternCircular, PatternLinear, Selector } from "../ir.js";
import type { PlaneBasis } from "./plane_basis.js";
import { axisVector, expectNumber, normalizeVector } from "./vector_math.js";

type PatternDeps = {
  planeBasisFromFace: (face: any) => PlaneBasis;
  faceCenter: (face: any) => [number, number, number];
  patternKey: (id: string) => string;
  resolveOwnerShape: (selection: KernelSelection, upstream: KernelResult) => any | null;
  transformShapeTranslate: (shape: any, delta: [number, number, number]) => any;
  transformShapeRotate: (
    shape: any,
    origin: [number, number, number],
    axis: [number, number, number],
    angleRad: number
  ) => any;
  unionShapesBalanced: (shapes: any[]) => any | null;
  collectSelections: (
    shape: any,
    featureId: string,
    ownerKey: string,
    featureTags?: string[]
  ) => KernelSelection[];
};

export function execPattern(params: {
  feature: PatternLinear | PatternCircular;
  upstream: KernelResult;
  resolve: ExecuteInput["resolve"];
  deps: PatternDeps;
}): KernelResult {
  const { feature, upstream, resolve, deps } = params;
  const originSel = resolve(feature.origin, upstream);
  if (originSel.kind !== "face") {
    throw new Error("OCCT backend: pattern origin must resolve to a face");
  }
  const face = originSel.meta["shape"];
  if (!face) {
    throw new Error("OCCT backend: pattern origin face missing shape");
  }
  const basis = deps.planeBasisFromFace(face);
  const origin = deps.faceCenter(face);
  const outputs = new Map<string, KernelObject>();

  const source = (feature as { source?: Selector }).source;
  const sourceResult = (feature as { result?: string }).result;
  const isFeaturePattern = source !== undefined;
  let sourceShape: any | null = null;
  if (isFeaturePattern) {
    const sourceSelection = resolve(source as Selector, upstream);
    if (sourceSelection.kind !== "solid") {
      throw new Error("OCCT backend: pattern source must resolve to a solid");
    }
    sourceShape = deps.resolveOwnerShape(sourceSelection as KernelSelection, upstream);
    if (!sourceShape) {
      throw new Error("OCCT backend: pattern source missing owner shape");
    }
    if (!sourceResult) {
      throw new Error("OCCT backend: pattern result is required when source is set");
    }
  }

  if (feature.kind === "pattern.linear") {
    const spacing: [number, number] = [
      expectNumber(feature.spacing[0], "pattern spacing X"),
      expectNumber(feature.spacing[1], "pattern spacing Y"),
    ];
    const count: [number, number] = [
      Math.max(1, Math.round(expectNumber(feature.count[0], "pattern count X"))),
      Math.max(1, Math.round(expectNumber(feature.count[1], "pattern count Y"))),
    ];
    outputs.set(deps.patternKey(feature.id), {
      id: `${feature.id}:pattern`,
      kind: "pattern" as const,
      meta: {
        type: "pattern.linear",
        origin,
        xDir: basis.xDir,
        yDir: basis.yDir,
        normal: basis.normal,
        spacing,
        count,
      },
    });
    if (isFeaturePattern && sourceShape && sourceResult) {
      const instances: any[] = [];
      for (let i = 0; i < count[0]; i += 1) {
        for (let j = 0; j < count[1]; j += 1) {
          if (i === 0 && j === 0) {
            instances.push(sourceShape);
            continue;
          }
          const delta: [number, number, number] = [
            basis.xDir[0] * spacing[0] * i + basis.yDir[0] * spacing[1] * j,
            basis.xDir[1] * spacing[0] * i + basis.yDir[1] * spacing[1] * j,
            basis.xDir[2] * spacing[0] * i + basis.yDir[2] * spacing[1] * j,
          ];
          instances.push(deps.transformShapeTranslate(sourceShape, delta));
        }
      }
      const merged = deps.unionShapesBalanced(instances);
      if (!merged) {
        throw new Error("OCCT backend: pattern generated no instances");
      }
      outputs.set(sourceResult, {
        id: `${feature.id}:solid`,
        kind: "solid",
        meta: { shape: merged },
      });
      const selections = deps.collectSelections(merged, feature.id, sourceResult, feature.tags);
      return { outputs, selections };
    }
    return { outputs, selections: [] };
  }

  const count = Math.max(1, Math.round(expectNumber(feature.count, "pattern count")));
  const axisDir = axisVector(feature.axis);
  const axis = normalizeVector(axisDir);
  outputs.set(deps.patternKey(feature.id), {
    id: `${feature.id}:pattern`,
    kind: "pattern" as const,
    meta: {
      type: "pattern.circular",
      origin,
      xDir: basis.xDir,
      yDir: basis.yDir,
      normal: basis.normal,
      axis,
      count,
    },
  });
  if (isFeaturePattern && sourceShape && sourceResult) {
    const instances: any[] = [];
    for (let i = 0; i < count; i += 1) {
      if (i === 0) {
        instances.push(sourceShape);
        continue;
      }
      const angle = (Math.PI * 2 * i) / count;
      instances.push(deps.transformShapeRotate(sourceShape, origin, axis, angle));
    }
    const merged = deps.unionShapesBalanced(instances);
    if (!merged) {
      throw new Error("OCCT backend: pattern generated no instances");
    }
    outputs.set(sourceResult, {
      id: `${feature.id}:solid`,
      kind: "solid",
      meta: { shape: merged },
    });
    const selections = deps.collectSelections(merged, feature.id, sourceResult, feature.tags);
    return { outputs, selections };
  }
  return { outputs, selections: [] };
}
