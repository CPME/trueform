export type BuilderPrimitiveDeps = {
  occt: Record<string, any>;
  newOcct: (name: string, ...args: unknown[]) => any;
  tryBuild: (builder: any) => void;
  makeProgressRange: () => any;
  callWithFallback: (target: any, methods: string[], argSets: unknown[][]) => any;
  toWire: (wire: any) => any;
};

export function makeFilletBuilder(deps: BuilderPrimitiveDeps, shape: any) {
  const filletShape = deps.occt.ChFi3d_FilletShape?.ChFi3d_Rational;
  const candidates: Array<unknown[]> = filletShape ? [[shape, filletShape], [shape]] : [[shape]];
  for (const args of candidates) {
    try {
      return deps.newOcct("BRepFilletAPI_MakeFillet", ...args);
    } catch {
      continue;
    }
  }
  throw new Error("OCCT backend: failed to construct fillet builder");
}

export function makeChamferBuilder(deps: Pick<BuilderPrimitiveDeps, "newOcct">, shape: any) {
  try {
    return deps.newOcct("BRepFilletAPI_MakeChamfer", shape);
  } catch {
    throw new Error("OCCT backend: failed to construct chamfer builder");
  }
}

export function makeDraftBuilder(deps: Pick<BuilderPrimitiveDeps, "newOcct">, shape: any) {
  const candidates: Array<unknown[]> = [[shape], []];
  for (const args of candidates) {
    try {
      return deps.newOcct("BRepOffsetAPI_DraftAngle", ...args);
    } catch {
      continue;
    }
  }
  throw new Error("OCCT backend: failed to construct draft builder");
}

export function makeLoftBuilder(deps: Pick<BuilderPrimitiveDeps, "newOcct">, isSolid: boolean) {
  const candidates: Array<unknown[]> = [
    [isSolid, false, 1e-6],
    [isSolid, false],
    [isSolid],
    [],
  ];
  for (const args of candidates) {
    try {
      return deps.newOcct("BRepOffsetAPI_ThruSections", ...args);
    } catch {
      continue;
    }
  }
  throw new Error("OCCT backend: failed to construct loft builder");
}

export function addLoftWire(
  deps: Pick<BuilderPrimitiveDeps, "callWithFallback" | "toWire">,
  builder: any,
  wire: any
) {
  deps.callWithFallback(builder, ["AddWire", "AddWire_1", "Add"], [[deps.toWire(wire)]]);
}

export function makeBoolean(
  deps: Pick<BuilderPrimitiveDeps, "occt" | "newOcct" | "tryBuild" | "makeProgressRange">,
  op: "union" | "subtract" | "intersect" | "cut",
  left: any,
  right: any
) {
  const map: Record<string, string> = {
    union: "BRepAlgoAPI_Fuse",
    subtract: "BRepAlgoAPI_Cut",
    cut: "BRepAlgoAPI_Cut",
    intersect: "BRepAlgoAPI_Common",
  };
  const ctor = map[op];
  if (!ctor) {
    throw new Error(`OCCT backend: unsupported boolean op ${op}`);
  }
  const progress = deps.makeProgressRange();
  const ctorWithProgress = deps.occt[`${ctor}_3`];
  if (typeof ctorWithProgress === "function" && progress) {
    try {
      const builder = new ctorWithProgress(left, right, progress);
      deps.tryBuild(builder);
      return builder;
    } catch {
      // fall back to generic constructor search
    }
  }

  const candidates: Array<unknown[]> = [
    [left, right, progress],
    [left, right],
  ];
  for (const args of candidates) {
    try {
      const builder = deps.newOcct(ctor, ...args);
      deps.tryBuild(builder);
      return builder;
    } catch {
      continue;
    }
  }
  throw new Error(`OCCT backend: failed to construct ${ctor}`);
}

export function makeSection(
  deps: Pick<BuilderPrimitiveDeps, "newOcct" | "tryBuild" | "makeProgressRange">,
  left: any,
  right: any
) {
  const progress = deps.makeProgressRange();
  const candidates: Array<unknown[]> = [
    [left, right, false, progress],
    [left, right, false],
    [left, right, progress],
    [left, right],
  ];
  for (const args of candidates) {
    try {
      const builder = deps.newOcct("BRepAlgoAPI_Section", ...args);
      deps.tryBuild(builder);
      return builder;
    } catch {
      continue;
    }
  }
  throw new Error("OCCT backend: failed to construct BRepAlgoAPI_Section");
}

export function makeShapeList(
  deps: Pick<BuilderPrimitiveDeps, "newOcct" | "callWithFallback">,
  shapes: any[]
) {
  const list = deps.newOcct("TopTools_ListOfShape");
  for (const shape of shapes) {
    deps.callWithFallback(list, ["Append", "Append_1", "Add", "Add_1", "add"], [[shape]]);
  }
  return list;
}
