import type { PlaneBasis } from "./plane_basis.js";

type PipeShellOpts = {
  makeSolid?: boolean;
  allowFallback?: boolean;
  frenet?: boolean;
};

type SweepShellOpts = PipeShellOpts & {
  auxiliarySpine?: any;
  auxiliaryCurvilinear?: boolean;
  auxiliaryKeepContact?: boolean;
};

export type PipeShellPrimitiveDeps = {
  occt: any;
  newOcct: (name: string, ...args: unknown[]) => any;
  tryBuild: (builder: any) => void;
  readShape: (shape: any) => any;
  readFace: (shape: any) => any;
  callWithFallback: (target: any, methods: string[], argSets: unknown[][]) => any;
  makeProgressRange: () => any;
  makeShapeList: (shapes: any[]) => any;
  toFace: (face: any) => any;
  toWire: (wire: any) => any;
  makePnt: (x: number, y: number, z: number) => any;
  makeDir: (x: number, y: number, z: number) => any;
  makeAx2WithXDir: (origin: any, normal: any, xDir: any) => any;
  makeCircleEdge: (
    center: [number, number, number],
    radius: number,
    normal: [number, number, number]
  ) => any;
  makeWireFromEdges: (edges: any[]) => any;
  makeFaceFromWire: (wire: any) => any;
};

export function makeThickSolid(
  deps: PipeShellPrimitiveDeps,
  shape: any,
  removeFaces: any[],
  offset: number,
  tolerance: number,
  opts?: {
    intersection?: boolean;
    selfIntersection?: boolean;
    removeInternalEdges?: boolean;
  }
): any {
  const faces = deps.makeShapeList(removeFaces.map((face) => deps.toFace(face)));
  const mode = deps.occt.BRepOffset_Mode?.BRepOffset_Skin;
  const join = deps.occt.GeomAbs_JoinType?.GeomAbs_Arc;
  const progress = deps.makeProgressRange();
  const intersection = opts?.intersection ?? false;
  const selfIntersection = opts?.selfIntersection ?? false;
  const removeInternalEdges = opts?.removeInternalEdges ?? false;
  const argsList: unknown[][] = [[shape, faces, offset, tolerance]];
  if (mode !== undefined) {
    argsList.push([shape, faces, offset, tolerance, mode]);
  }
  if (mode !== undefined && join !== undefined) {
    argsList.push([
      shape,
      faces,
      offset,
      tolerance,
      mode,
      intersection,
      selfIntersection,
      join,
      removeInternalEdges,
    ]);
    if (progress !== null && progress !== undefined) {
      argsList.push([
        shape,
        faces,
        offset,
        tolerance,
        mode,
        intersection,
        selfIntersection,
        join,
        removeInternalEdges,
        progress,
      ]);
    }
  }

  let builder: any | null = null;
  try {
    builder = deps.newOcct("BRepOffsetAPI_MakeThickSolid");
  } catch {
    builder = null;
  }
  if (builder) {
    deps.callWithFallback(
      builder,
      ["MakeThickSolidByJoin", "MakeThickSolidByJoin_1", "MakeThickSolidByJoin_2"],
      argsList
    );
    deps.tryBuild(builder);
    return deps.readShape(builder);
  }

  for (const args of [[shape, faces, offset, tolerance], [shape, faces, offset]]) {
    try {
      const candidate = deps.newOcct("BRepOffsetAPI_MakeThickSolid", ...args);
      deps.tryBuild(candidate);
      return deps.readShape(candidate);
    } catch {
      continue;
    }
  }
  throw new Error("OCCT backend: failed to construct thick solid");
}

export function makePipeSolid(
  deps: PipeShellPrimitiveDeps,
  spine: any,
  profile: any,
  frame: PlaneBasis,
  opts?: PipeShellOpts
): any;
export function makePipeSolid(
  deps: PipeShellPrimitiveDeps,
  spine: any,
  profile: any,
  opts?: PipeShellOpts
): any;
export function makePipeSolid(
  deps: PipeShellPrimitiveDeps,
  spine: any,
  profile: any,
  frame?: PlaneBasis | PipeShellOpts,
  opts?: PipeShellOpts
) {
  const resolvedFrame = frame && "origin" in frame ? (frame as PlaneBasis) : undefined;
  const resolvedOpts = frame && "origin" in frame ? opts : (frame as PipeShellOpts | undefined);
  const makeSolid = resolvedOpts?.makeSolid !== false;
  const allowFallback = resolvedOpts?.allowFallback !== false;
  const frenet = resolvedOpts?.frenet === true;
  try {
    const shell = deps.newOcct("BRepOffsetAPI_MakePipeShell", spine);
    if (resolvedFrame) {
      trySetPipeShellMode(deps, shell, resolvedFrame);
    } else {
      trySetPipeShellFrenet(shell, frenet);
    }
    const mode = deps.occt.BRepBuilderAPI_TransitionMode?.BRepBuilderAPI_RoundCorner;
    if (mode && typeof shell.SetTransitionMode === "function") {
      shell.SetTransitionMode(mode);
    }
    const add =
      typeof shell.Add_1 === "function"
        ? shell.Add_1.bind(shell)
        : typeof shell.Add === "function"
          ? shell.Add.bind(shell)
          : null;
    if (!add) {
      throw new Error("OCCT backend: pipe shell missing Add()");
    }
    add(profile, false, false);
    deps.tryBuild(shell);
    if (makeSolid && typeof shell.MakeSolid === "function") {
      shell.MakeSolid();
    }
    return deps.readShape(shell);
  } catch {
    if (!allowFallback) {
      throw new Error("OCCT backend: pipe shell failed and fallback is disabled");
    }
    const builder = deps.newOcct("BRepOffsetAPI_MakePipe", spine, profile);
    deps.tryBuild(builder);
    return deps.readShape(builder);
  }
}

export function makeSweepSolid(
  deps: PipeShellPrimitiveDeps,
  spine: any,
  profile: any,
  frame: PlaneBasis,
  opts?: SweepShellOpts
): any;
export function makeSweepSolid(
  deps: PipeShellPrimitiveDeps,
  spine: any,
  profile: any,
  opts?: SweepShellOpts
): any;
export function makeSweepSolid(
  deps: PipeShellPrimitiveDeps,
  spine: any,
  profile: any,
  frame?: PlaneBasis | SweepShellOpts,
  opts?: SweepShellOpts
) {
  const resolvedFrame = frame && "origin" in frame ? (frame as PlaneBasis) : undefined;
  const resolvedOpts = frame && "origin" in frame ? opts : (frame as SweepShellOpts | undefined);
  const makeSolid = resolvedOpts?.makeSolid !== false;
  const allowFallback = resolvedOpts?.allowFallback !== false;
  const frenet = resolvedOpts?.frenet !== false;
  const auxiliarySpine = resolvedOpts?.auxiliarySpine;
  try {
    const shell = deps.newOcct("BRepOffsetAPI_MakePipeShell", spine);
    if (auxiliarySpine) {
      const applied = trySetPipeShellAuxiliary(deps, shell, auxiliarySpine, {
        curvilinear: resolvedOpts?.auxiliaryCurvilinear,
        keepContact: resolvedOpts?.auxiliaryKeepContact,
      });
      if (!applied) {
        if (resolvedFrame) {
          trySetPipeShellMode(deps, shell, resolvedFrame);
        } else {
          trySetPipeShellFrenet(shell, frenet);
        }
      }
    } else if (resolvedFrame) {
      trySetPipeShellMode(deps, shell, resolvedFrame);
    } else {
      trySetPipeShellFrenet(shell, frenet);
    }
    const mode = deps.occt.BRepBuilderAPI_TransitionMode?.BRepBuilderAPI_RoundCorner;
    if (mode && typeof shell.SetTransitionMode === "function") {
      shell.SetTransitionMode(mode);
    }
    const add =
      typeof shell.Add_1 === "function"
        ? shell.Add_1.bind(shell)
        : typeof shell.Add === "function"
          ? shell.Add.bind(shell)
          : null;
    if (!add) {
      throw new Error("OCCT backend: sweep shell missing Add()");
    }
    add(profile, false, false);
    deps.tryBuild(shell);
    if (makeSolid && typeof shell.MakeSolid === "function") {
      shell.MakeSolid();
    }
    return deps.readShape(shell);
  } catch {
    if (!allowFallback) {
      throw new Error("OCCT backend: sweep shell failed and fallback is disabled");
    }
    const builder = deps.newOcct("BRepOffsetAPI_MakePipe", spine, profile);
    deps.tryBuild(builder);
    return deps.readShape(builder);
  }
}

export function makeRingFace(
  deps: PipeShellPrimitiveDeps,
  center: [number, number, number],
  normal: [number, number, number],
  outerRadius: number,
  innerRadius: number
) {
  const outerWire = deps.makeWireFromEdges([deps.makeCircleEdge(center, outerRadius, normal)]);
  const faceBuilder = deps.makeFaceFromWire(outerWire);
  if (innerRadius > 0) {
    const innerWire = deps.makeWireFromEdges([deps.makeCircleEdge(center, innerRadius, normal)]);
    if (typeof faceBuilder.Add === "function") {
      faceBuilder.Add(innerWire);
    } else if (typeof faceBuilder.add === "function") {
      faceBuilder.add(innerWire);
    } else {
      throw new Error("OCCT backend: face builder missing Add()");
    }
  }
  return deps.readFace(faceBuilder);
}

function trySetPipeShellFrenet(shell: any, frenet: boolean): boolean {
  for (const name of ["SetMode_1", "SetMode"]) {
    const fn = shell?.[name];
    if (typeof fn !== "function") continue;
    try {
      fn.call(shell, frenet);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function trySetPipeShellMode(
  deps: PipeShellPrimitiveDeps,
  shell: any,
  frame: PlaneBasis
): boolean {
  const origin = deps.makePnt(frame.origin[0], frame.origin[1], frame.origin[2]);
  const normal = deps.makeDir(frame.normal[0], frame.normal[1], frame.normal[2]);
  const xDir = deps.makeDir(frame.xDir[0], frame.xDir[1], frame.xDir[2]);
  const ax2 = deps.makeAx2WithXDir(origin, normal, xDir);
  const candidates: Array<{ names: string[]; args: unknown[] }> = [
    { names: ["SetMode_3", "SetMode_2", "SetMode_1", "SetMode"], args: [ax2] },
    { names: ["SetMode_2", "SetMode_1", "SetMode"], args: [xDir] },
    { names: ["SetMode_1", "SetMode"], args: [false] },
  ];
  for (const candidate of candidates) {
    for (const name of candidate.names) {
      const fn = shell?.[name];
      if (typeof fn !== "function") continue;
      try {
        fn.call(shell, ...candidate.args);
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}

function trySetPipeShellAuxiliary(
  deps: PipeShellPrimitiveDeps,
  shell: any,
  auxiliarySpine: any,
  opts?: { curvilinear?: boolean; keepContact?: boolean }
): boolean {
  const wire = deps.toWire(auxiliarySpine);
  const curvilinear = opts?.curvilinear ?? true;
  const keepContact = opts?.keepContact ?? true;
  const candidates: Array<{ names: string[]; args: unknown[] }> = [
    { names: ["SetMode_5", "SetMode_4", "SetMode_3", "SetMode_2", "SetMode"], args: [wire, curvilinear, keepContact] },
    { names: ["SetMode_5", "SetMode_4", "SetMode_3", "SetMode_2", "SetMode"], args: [wire, curvilinear] },
    { names: ["SetMode_5", "SetMode_4", "SetMode_3", "SetMode_2", "SetMode"], args: [wire] },
  ];
  for (const candidate of candidates) {
    for (const name of candidate.names) {
      const fn = shell?.[name];
      if (typeof fn !== "function") continue;
      try {
        fn.call(shell, ...candidate.args);
        return true;
      } catch {
        continue;
      }
    }
  }
  return false;
}
