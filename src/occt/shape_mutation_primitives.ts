import type { KernelObject, KernelSelection } from "../backend.js";

export type ShapeMutationPrimitiveDeps = {
  occt: any;
  newOcct: (name: string, ...args: unknown[]) => any;
  callWithFallback: (target: any, methods: string[], argSets: unknown[][]) => any;
  tryBuild: (builder: any) => void;
  readShape: (shape: any) => any;
  makeProgressRange: () => any;
  toFace: (face: any) => any;
  toEdge: (edge: any) => any;
  toShell: (shell: any) => any;
  shapeHash: (shape: any) => number;
  shapesSame: (left: any, right: any) => boolean;
  checkValid: (target: KernelObject) => boolean;
  countSolids: (shape: any) => number;
  makeShapeList: (shapes: any[]) => any;
};

export function makeSolidFromShells(
  deps: ShapeMutationPrimitiveDeps,
  shape: any
): any | null {
  const shells: any[] = [];
  const explorer = new deps.occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SHELL,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  for (; explorer.More(); explorer.Next()) {
    shells.push(explorer.Current());
  }
  if (shells.length === 0) return null;
  let builder: any;
  try {
    builder = deps.newOcct("BRepBuilderAPI_MakeSolid");
  } catch {
    return null;
  }
  for (const shell of shells) {
    deps.callWithFallback(builder, ["Add", "Add_1"], [[deps.toShell(shell)]]);
  }
  deps.tryBuild(builder);
  try {
    return deps.readShape(builder);
  } catch {
    return null;
  }
}

export function deleteFacesWithDefeaturing(
  deps: ShapeMutationPrimitiveDeps,
  shape: any,
  removeFaces: any[]
): any | null {
  let builder: any;
  try {
    builder = deps.newOcct("BRepAlgoAPI_Defeaturing", shape);
  } catch {
    try {
      builder = deps.newOcct("BRepAlgoAPI_Defeaturing");
    } catch {
      return null;
    }
    try {
      deps.callWithFallback(builder, ["SetShape", "SetShape_1"], [[shape]]);
    } catch {
      return null;
    }
  }

  const faceList = deps.makeShapeList(removeFaces.map((face) => deps.toFace(face)));
  let added = false;
  try {
    deps.callWithFallback(
      builder,
      ["AddFacesToRemove", "AddFacesToRemove_1", "SetFacesToRemove", "SetFacesToRemove_1"],
      [[faceList]]
    );
    added = true;
  } catch {
    // fall back to individual face adds
  }
  if (!added) {
    for (const face of removeFaces) {
      try {
        deps.callWithFallback(
          builder,
          ["AddFaceToRemove", "AddFaceToRemove_1", "AddFace", "AddFace_1", "Add", "Add_1"],
          [[deps.toFace(face)]]
        );
        added = true;
      } catch {
        continue;
      }
    }
  }
  if (!added) return null;

  try {
    deps.tryBuild(builder);
    return deps.readShape(builder);
  } catch {
    return null;
  }
}

export function deleteFacesBySewing(
  deps: ShapeMutationPrimitiveDeps,
  shape: any,
  removeFaces: any[]
): any | null {
  let sewing: any;
  try {
    sewing = deps.newOcct("BRepBuilderAPI_Sewing", 1e-6, true, true, true, false);
  } catch {
    try {
      sewing = deps.newOcct("BRepBuilderAPI_Sewing");
    } catch {
      return null;
    }
  }
  const add =
    typeof sewing.Add_1 === "function"
      ? sewing.Add_1.bind(sewing)
      : typeof sewing.Add === "function"
        ? sewing.Add.bind(sewing)
        : null;
  if (!add) return null;

  let kept = 0;
  const explorer = new deps.occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_FACE,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  for (; explorer.More(); explorer.Next()) {
    const face = deps.toFace(explorer.Current());
    if (containsShape(deps, removeFaces, face)) continue;
    try {
      add(face);
      kept += 1;
    } catch {
      continue;
    }
  }
  if (kept === 0) return null;

  try {
    const progress = deps.makeProgressRange();
    if (progress !== null && progress !== undefined) {
      sewing.Perform(progress);
    } else {
      sewing.Perform();
    }
  } catch {
    try {
      sewing.Perform();
    } catch {
      return null;
    }
  }

  try {
    return deps.callWithFallback(sewing, ["SewedShape", "SewedShape_1"], [[]]);
  } catch {
    return null;
  }
}

export function replaceFacesWithReshape(
  deps: ShapeMutationPrimitiveDeps,
  shape: any,
  replacements: Array<{ from: any; to: any }>
): any | null {
  let reshape: any;
  try {
    reshape = deps.newOcct("BRepTools_ReShape");
  } catch {
    try {
      reshape = deps.newOcct("ShapeBuild_ReShape");
    } catch {
      return null;
    }
  }

  let replacedAny = false;
  for (const replacement of replacements) {
    try {
      deps.callWithFallback(reshape, ["Replace", "Replace_1"], [
        [deps.toFace(replacement.from), deps.toFace(replacement.to)],
        [deps.toFace(replacement.from), deps.toFace(replacement.to), true],
        [deps.toFace(replacement.from), deps.toFace(replacement.to), false],
      ]);
      replacedAny = true;
    } catch {
      continue;
    }
  }
  if (!replacedAny) return null;

  try {
    return deps.callWithFallback(reshape, ["Apply", "Apply_1"], [[shape]]);
  } catch {
    return null;
  }
}

export function replaceFacesBySewing(
  deps: ShapeMutationPrimitiveDeps,
  shape: any,
  removeFaces: any[],
  replacementFaces: any[]
): any | null {
  let sewing: any;
  try {
    sewing = deps.newOcct("BRepBuilderAPI_Sewing", 1e-6, true, true, true, false);
  } catch {
    try {
      sewing = deps.newOcct("BRepBuilderAPI_Sewing");
    } catch {
      return null;
    }
  }
  const add =
    typeof sewing.Add_1 === "function"
      ? sewing.Add_1.bind(sewing)
      : typeof sewing.Add === "function"
        ? sewing.Add.bind(sewing)
        : null;
  if (!add) return null;

  const facesToRemove = uniqueShapeList(deps, removeFaces);
  let added = 0;

  const explorer = new deps.occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_FACE,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  for (; explorer.More(); explorer.Next()) {
    const face = deps.toFace(explorer.Current());
    if (containsShape(deps, facesToRemove, face)) continue;
    try {
      add(face);
      added += 1;
    } catch {
      continue;
    }
  }
  for (const face of replacementFaces) {
    try {
      add(deps.toFace(face));
      added += 1;
    } catch {
      continue;
    }
  }
  if (added === 0) return null;

  try {
    const progress = deps.makeProgressRange();
    if (progress !== null && progress !== undefined) {
      sewing.Perform(progress);
    } else {
      sewing.Perform();
    }
  } catch {
    try {
      sewing.Perform();
    } catch {
      return null;
    }
  }
  try {
    return deps.callWithFallback(sewing, ["SewedShape", "SewedShape_1"], [[]]);
  } catch {
    return null;
  }
}

export function uniqueFaceShapes(
  deps: ShapeMutationPrimitiveDeps,
  selections: KernelSelection[]
): any[] {
  const faces: any[] = [];
  for (const selection of selections) {
    const shape = selection.meta["shape"];
    if (!shape) continue;
    faces.push(deps.toFace(shape));
  }
  return uniqueShapeList(deps, faces);
}

export function collectToolFaces(
  deps: ShapeMutationPrimitiveDeps,
  selections: KernelSelection[]
): any[] {
  const faces: any[] = [];
  for (const selection of selections) {
    const shape = selection.meta["shape"];
    if (!shape) continue;
    if (selection.kind === "face") {
      faces.push(deps.toFace(shape));
      continue;
    }
    if (selection.kind === "surface") {
      faces.push(...collectFacesFromShape(deps, shape));
    }
  }
  return uniqueShapeList(deps, faces);
}

export function collectFacesFromShape(
  deps: ShapeMutationPrimitiveDeps,
  shape: any
): any[] {
  const explorer = new deps.occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_FACE,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  const faces: any[] = [];
  for (; explorer.More(); explorer.Next()) {
    faces.push(deps.toFace(explorer.Current()));
  }
  return faces;
}

export function collectEdgesFromShape(
  deps: ShapeMutationPrimitiveDeps,
  shape: any
): any[] {
  const explorer = new deps.occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    deps.occt.TopAbs_ShapeEnum.TopAbs_EDGE,
    deps.occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  const edges: any[] = [];
  for (; explorer.More(); explorer.Next()) {
    edges.push(deps.toEdge(explorer.Current()));
  }
  return edges;
}

export function uniqueShapeList(
  deps: Pick<ShapeMutationPrimitiveDeps, "shapeHash" | "shapesSame">,
  shapes: any[]
): any[] {
  const unique: any[] = [];
  for (const shape of shapes) {
    if (containsShape(deps, unique, shape)) continue;
    unique.push(shape);
  }
  return unique;
}

export function containsShape(
  deps: Pick<ShapeMutationPrimitiveDeps, "shapeHash" | "shapesSame">,
  candidates: any[],
  shape: any
): boolean {
  const hash = deps.shapeHash(shape);
  for (const candidate of candidates) {
    if (deps.shapeHash(candidate) !== hash) continue;
    if (deps.shapesSame(candidate, shape)) return true;
  }
  return false;
}

export function isValidShape(
  deps: Pick<ShapeMutationPrimitiveDeps, "checkValid">,
  shape: any,
  kind: KernelObject["kind"] = "solid"
): boolean {
  try {
    return deps.checkValid({ id: "tmp", kind, meta: { shape } } as KernelObject);
  } catch {
    return true;
  }
}

export function solidVolume(
  deps: Pick<ShapeMutationPrimitiveDeps, "occt">,
  solid: any
): number {
  if (!deps.occt.GProp_GProps_1 || !deps.occt.BRepGProp?.VolumeProperties_1) {
    return -Infinity;
  }
  try {
    const props = new deps.occt.GProp_GProps_1();
    deps.occt.BRepGProp.VolumeProperties_1(solid, props, true, true, true);
    const mass = typeof props.Mass === "function" ? props.Mass() : undefined;
    return typeof mass === "number" && !Number.isNaN(mass) ? mass : -Infinity;
  } catch {
    return -Infinity;
  }
}
