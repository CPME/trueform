import type { KernelResult, KernelSelection } from "../backend.js";
import { resolveSelectorSet } from "../selectors.js";
import type {
  DeleteFace,
  MoveBody,
  MoveFace,
  ReplaceFace,
  SplitBody,
  SplitFace,
} from "../ir.js";
import { expectNumber } from "./vector_math.js";
import type { FaceEditContext } from "./operation_contexts.js";

function uniqueSelectionShapes(ctx: FaceEditContext, selections: KernelSelection[]): any[] {
  const shapes: any[] = [];
  const seen = new Set<number>();
  for (const selection of selections) {
    const shape = selection.meta["shape"];
    if (!shape) continue;
    const hash = ctx.shapeHash(shape);
    if (seen.has(hash)) continue;
    seen.add(hash);
    shapes.push(shape);
  }
  return shapes;
}

export function execDeleteFace(ctx: FaceEditContext, feature: DeleteFace, upstream: KernelResult): KernelResult {
  const source = resolveSelectorSet(feature.source, ctx.toResolutionContext(upstream));
  if (source.length === 0) {
    throw new Error("OCCT backend: delete face source selector matched 0 entities");
  }
  if (source.length !== 1 || source[0]?.kind !== "solid") {
    throw new Error("OCCT backend: delete face source selector must resolve to one solid");
  }
  const sourceSelection = source[0] as KernelSelection;
  const ownerKey = ctx.resolveOwnerKey(sourceSelection, upstream);
  const ownerShape = ctx.resolveOwnerShape(sourceSelection, upstream);
  if (!ownerShape) {
    throw new Error("OCCT backend: delete face source missing owner solid");
  }

  const targets = resolveSelectorSet(feature.faces, ctx.toResolutionContext(upstream));
  if (targets.length === 0) {
    throw new Error("OCCT backend: delete face selector matched 0 entities");
  }
  for (const target of targets) {
    if (target.kind !== "face") {
      throw new Error("OCCT backend: delete face selector must resolve to faces");
    }
    const targetOwner =
      typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : "";
    if (targetOwner && targetOwner !== ownerKey) {
      throw new Error("OCCT backend: delete face targets must belong to source solid");
    }
  }

  const removeFaces = uniqueSelectionShapes(ctx, targets as KernelSelection[]);
  if (removeFaces.length === 0) {
    throw new Error("OCCT backend: delete face resolved no target faces");
  }

  let result =
    feature.heal === false
      ? ctx.deleteFacesBySewing(ownerShape, removeFaces)
      : ctx.deleteFacesWithDefeaturing(ownerShape, removeFaces) ??
        ctx.deleteFacesBySewing(ownerShape, removeFaces);
  if (!result) {
    throw new Error("OCCT backend: failed to delete faces");
  }

  if (feature.heal !== false) {
    const healed = ctx.makeSolidFromShells(result);
    if (healed) {
      result = ctx.normalizeSolid(healed);
    }
  }

  const outputKind: "solid" | "surface" = ctx.shapeHasSolid(result) ? "solid" : "surface";
  if (outputKind === "solid" && !ctx.isValidShape(result)) {
    throw new Error("OCCT backend: delete face produced invalid solid");
  }

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape: result },
      },
    ],
  ]);
  const selections = ctx.collectSelections(result, feature.id, feature.result, feature.tags, {
    rootKind: outputKind === "solid" ? "solid" : "face",
    ledgerPlan: ctx.makeFaceMutationSelectionLedgerPlan(upstream, ownerShape, []),
  });
  return { outputs, selections };
}

export function execReplaceFace(ctx: FaceEditContext, feature: ReplaceFace, upstream: KernelResult): KernelResult {
  const source = resolveSelectorSet(feature.source, ctx.toResolutionContext(upstream));
  if (source.length === 0) {
    throw new Error("OCCT backend: replace face source selector matched 0 entities");
  }
  if (source.length !== 1 || source[0]?.kind !== "solid") {
    throw new Error("OCCT backend: replace face source selector must resolve to one solid");
  }
  const sourceSelection = source[0] as KernelSelection;
  const ownerKey = ctx.resolveOwnerKey(sourceSelection, upstream);
  const ownerShape = ctx.resolveOwnerShape(sourceSelection, upstream);
  if (!ownerShape) {
    throw new Error("OCCT backend: replace face source missing owner solid");
  }

  const targets = resolveSelectorSet(feature.faces, ctx.toResolutionContext(upstream));
  if (targets.length === 0) {
    throw new Error("OCCT backend: replace face selector matched 0 entities");
  }
  for (const target of targets) {
    if (target.kind !== "face") {
      throw new Error("OCCT backend: replace face selector must resolve to faces");
    }
    const targetOwner =
      typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : "";
    if (targetOwner && targetOwner !== ownerKey) {
      throw new Error("OCCT backend: replace face targets must belong to source solid");
    }
  }

  const replaceFaces = ctx.uniqueFaceShapes(targets);
  if (replaceFaces.length === 0) {
    throw new Error("OCCT backend: replace face resolved no target faces");
  }

  const tools = resolveSelectorSet(feature.tool, ctx.toResolutionContext(upstream));
  if (tools.length === 0) {
    throw new Error("OCCT backend: replace face tool selector matched 0 entities");
  }
  for (const tool of tools) {
    if (tool.kind !== "face" && tool.kind !== "surface") {
      throw new Error("OCCT backend: replace face tool selector must resolve to face/surface");
    }
  }

  const toolFaces = ctx.collectToolFaces(tools);
  if (toolFaces.length === 0) {
    throw new Error("OCCT backend: replace face tool selector resolved no faces");
  }
  if (toolFaces.length !== 1 && toolFaces.length !== replaceFaces.length) {
    throw new Error(
      "OCCT backend: replace face tool face count must be 1 or match target face count"
    );
  }

  const replacements = replaceFaces.map((face: any, index: number) => ({
    from: face,
    to: toolFaces[Math.min(index, toolFaces.length - 1)] as any,
  }));

  let result =
    ctx.replaceFacesWithReshape(ownerShape, replacements) ??
    ctx.replaceFacesBySewing(ownerShape, replaceFaces, replacements.map((entry: any) => entry.to));
  if (!result) {
    throw new Error("OCCT backend: failed to replace faces");
  }

  if (feature.heal !== false) {
    const healed = ctx.makeSolidFromShells(result);
    if (healed) {
      result = ctx.normalizeSolid(healed);
    }
  }

  const outputKind: "solid" | "surface" = ctx.shapeHasSolid(result) ? "solid" : "surface";
  if (outputKind === "solid" && !ctx.isValidShape(result)) {
    throw new Error("OCCT backend: replace face produced invalid solid");
  }

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape: result },
      },
    ],
  ]);
  const selections = ctx.collectSelections(result, feature.id, feature.result, feature.tags, {
    rootKind: outputKind === "solid" ? "solid" : "face",
    ledgerPlan: ctx.makeFaceMutationSelectionLedgerPlan(
      upstream,
      ownerShape,
      replacements.map((replacement: any, index: number) => ({
        from: targets[Math.min(index, targets.length - 1)] as KernelSelection,
        to: replacement.to,
      }))
    ),
  });
  return { outputs, selections };
}

export function execMoveFace(ctx: FaceEditContext, feature: MoveFace, upstream: KernelResult): KernelResult {
  const source = resolveSelectorSet(feature.source, ctx.toResolutionContext(upstream));
  if (source.length === 0) {
    throw new Error("OCCT backend: move face source selector matched 0 entities");
  }
  if (source.length !== 1 || source[0]?.kind !== "solid") {
    throw new Error("OCCT backend: move face source selector must resolve to one solid");
  }
  const sourceSelection = source[0] as KernelSelection;
  const ownerKey = ctx.resolveOwnerKey(sourceSelection, upstream);
  const ownerShape = ctx.resolveOwnerShape(sourceSelection, upstream);
  if (!ownerShape) {
    throw new Error("OCCT backend: move face source missing owner solid");
  }

  const targets = resolveSelectorSet(feature.faces, ctx.toResolutionContext(upstream));
  if (targets.length === 0) {
    throw new Error("OCCT backend: move face selector matched 0 entities");
  }
  for (const target of targets) {
    if (target.kind !== "face") {
      throw new Error("OCCT backend: move face selector must resolve to faces");
    }
    const targetOwner =
      typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : "";
    if (targetOwner && targetOwner !== ownerKey) {
      throw new Error("OCCT backend: move face targets must belong to source solid");
    }
  }

  const sourceFaces = ctx.uniqueFaceShapes(targets);
  if (sourceFaces.length === 0) {
    throw new Error("OCCT backend: move face resolved no target faces");
  }

  const transformOrigin = (() => {
    const origin = feature.origin ?? [0, 0, 0];
    return [
      expectNumber(origin[0], "move face origin[0]"),
      expectNumber(origin[1], "move face origin[1]"),
      expectNumber(origin[2], "move face origin[2]"),
    ] as [number, number, number];
  })();

  const movedFaces = sourceFaces.map((face: any) => {
    let moved = face;
    if (feature.scale !== undefined) {
      const scale = expectNumber(feature.scale, "move face scale");
      if (!(scale > 0)) {
        throw new Error("OCCT backend: move face scale must be positive");
      }
      moved = ctx.transformShapeScale(moved, transformOrigin, scale);
    }
    if (feature.rotationAxis !== undefined || feature.rotationAngle !== undefined) {
      if (feature.rotationAxis === undefined || feature.rotationAngle === undefined) {
        throw new Error(
          "OCCT backend: move face rotationAxis and rotationAngle must be provided together"
        );
      }
      const axis = ctx.resolveAxisSpec(feature.rotationAxis, upstream, "move face rotation axis");
      const angle = expectNumber(feature.rotationAngle, "move face rotationAngle");
      moved = ctx.transformShapeRotate(moved, transformOrigin, axis, angle);
    }
    if (feature.translation !== undefined) {
      const delta: [number, number, number] = [
        expectNumber(feature.translation[0], "move face translation[0]"),
        expectNumber(feature.translation[1], "move face translation[1]"),
        expectNumber(feature.translation[2], "move face translation[2]"),
      ];
      moved = ctx.transformShapeTranslate(moved, delta);
    }
    return moved;
  });

  const replacements = sourceFaces.map((face: any, index: number) => ({
    from: face,
    to: movedFaces[index] as any,
  }));
  let result =
    ctx.replaceFacesWithReshape(ownerShape, replacements) ??
    ctx.replaceFacesBySewing(ownerShape, sourceFaces, movedFaces);
  if (!result) {
    throw new Error("OCCT backend: failed to move faces");
  }

  if (feature.heal !== false) {
    const healed = ctx.makeSolidFromShells(result);
    if (healed) {
      result = ctx.normalizeSolid(healed);
    }
  }

  let outputKind: "solid" | "surface" = ctx.shapeHasSolid(result) ? "solid" : "surface";
  if (outputKind === "solid" && !ctx.isValidShape(result)) {
    const fallback = ctx.replaceFacesBySewing(ownerShape, sourceFaces, movedFaces);
    if (fallback) {
      result = fallback;
      outputKind = ctx.shapeHasSolid(result) ? "solid" : "surface";
    }
  }
  if (outputKind === "solid" && !ctx.isValidShape(result)) {
    throw new Error("OCCT backend: move face produced invalid solid");
  }

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape: result },
      },
    ],
  ]);
  const selections = ctx.collectSelections(result, feature.id, feature.result, feature.tags, {
    rootKind: outputKind === "solid" ? "solid" : "face",
    ledgerPlan: ctx.makeFaceMutationSelectionLedgerPlan(
      upstream,
      ownerShape,
      movedFaces.map((movedFace: any, index: number) => ({
        from: targets[Math.min(index, targets.length - 1)] as KernelSelection,
        to: movedFace,
      }))
    ),
  });
  return { outputs, selections };
}

export function execMoveBody(ctx: FaceEditContext, feature: MoveBody, upstream: KernelResult): KernelResult {
  const sourceSel = resolveSelectorSet(feature.source, ctx.toResolutionContext(upstream));
  if (sourceSel.length === 0) {
    throw new Error("OCCT backend: move body source selector matched 0 entities");
  }
  for (const selection of sourceSel) {
    if (selection.kind !== "solid" && selection.kind !== "face" && selection.kind !== "surface") {
      throw new Error("OCCT backend: move body source selector must resolve to solid/face/surface");
    }
  }

  const ownerKeys = new Set<string>();
  for (const selection of sourceSel) {
    ownerKeys.add(ctx.resolveOwnerKey(selection as KernelSelection, upstream));
  }
  if (ownerKeys.size !== 1) {
    throw new Error("OCCT backend: move body source selector must resolve to a single owner");
  }

  const ownerShape = ctx.resolveOwnerShape(sourceSel[0] as KernelSelection, upstream);
  if (!ownerShape) {
    throw new Error("OCCT backend: move body source missing owner shape");
  }

  const transformOrigin = (() => {
    const origin = feature.origin ?? [0, 0, 0];
    return [
      expectNumber(origin[0], "move body origin[0]"),
      expectNumber(origin[1], "move body origin[1]"),
      expectNumber(origin[2], "move body origin[2]"),
    ] as [number, number, number];
  })();

  let moved: any = ownerShape;
  const faceReplacements: Array<{ from: KernelSelection; to: any }> = ctx
    .ownerFaceSelectionsForShape(upstream, ownerShape)
    .map((selection: any) => ({
      from: selection,
      to: selection.meta["shape"],
    }));

  if (feature.scale !== undefined) {
    const scale = expectNumber(feature.scale, "move body scale");
    if (!(scale > 0)) {
      throw new Error("OCCT backend: move body scale must be positive");
    }
    moved = ctx.transformShapeScale(moved, transformOrigin, scale);
    for (const replacement of faceReplacements) {
      if (!replacement.to) continue;
      replacement.to = ctx.transformShapeScale(replacement.to, transformOrigin, scale);
    }
  }

  if (feature.rotationAxis !== undefined || feature.rotationAngle !== undefined) {
    if (feature.rotationAxis === undefined || feature.rotationAngle === undefined) {
      throw new Error(
        "OCCT backend: move body rotationAxis and rotationAngle must be provided together"
      );
    }
    const axis = ctx.resolveAxisSpec(feature.rotationAxis, upstream, "move body rotation axis");
    const angle = expectNumber(feature.rotationAngle, "move body rotationAngle");
    moved = ctx.transformShapeRotate(moved, transformOrigin, axis, angle);
    for (const replacement of faceReplacements) {
      if (!replacement.to) continue;
      replacement.to = ctx.transformShapeRotate(replacement.to, transformOrigin, axis, angle);
    }
  }

  if (feature.translation !== undefined) {
    const delta: [number, number, number] = [
      expectNumber(feature.translation[0], "move body translation[0]"),
      expectNumber(feature.translation[1], "move body translation[1]"),
      expectNumber(feature.translation[2], "move body translation[2]"),
    ];
    moved = ctx.transformShapeTranslate(moved, delta);
    for (const replacement of faceReplacements) {
      if (!replacement.to) continue;
      replacement.to = ctx.transformShapeTranslate(replacement.to, delta);
    }
  }

  const outputKind: "solid" | "face" | "surface" = ctx.shapeHasSolid(moved)
    ? "solid"
    : sourceSel.some((selection) => selection.kind === "surface")
      ? "surface"
      : "face";

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape: moved },
      },
    ],
  ]);
  const selections = ctx.collectSelections(moved, feature.id, feature.result, feature.tags, {
    rootKind: outputKind === "solid" ? "solid" : "face",
    ledgerPlan: ctx.makeFaceMutationSelectionLedgerPlan(
      upstream,
      ownerShape,
      faceReplacements.filter(
        (replacement: any): replacement is { from: KernelSelection; to: any } => !!replacement.to
      )
    ),
  });
  return { outputs, selections };
}

export function execSplitBody(ctx: FaceEditContext, feature: SplitBody, upstream: KernelResult): KernelResult {
  const sourceSel = resolveSelectorSet(feature.source, ctx.toResolutionContext(upstream));
  if (sourceSel.length === 0) {
    throw new Error("OCCT backend: split body source selector matched 0 entities");
  }
  for (const selection of sourceSel) {
    if (selection.kind !== "solid" && selection.kind !== "face") {
      throw new Error("OCCT backend: split body source selector must resolve to solid/face");
    }
  }

  const sourceOwnerKeys = new Set<string>();
  for (const selection of sourceSel) {
    sourceOwnerKeys.add(ctx.resolveOwnerKey(selection as KernelSelection, upstream));
  }
  if (sourceOwnerKeys.size !== 1) {
    throw new Error("OCCT backend: split body source selector must resolve to a single owner");
  }

  const sourceOwner = ctx.resolveOwnerShape(sourceSel[0] as KernelSelection, upstream);
  if (!sourceOwner) {
    throw new Error("OCCT backend: split body source must resolve to a solid owner");
  }

  const toolSelections = resolveSelectorSet(feature.tool, ctx.toResolutionContext(upstream));
  if (toolSelections.length === 0) {
    throw new Error("OCCT backend: split body tool selector matched 0 entities");
  }
  for (const selection of toolSelections) {
    if (selection.kind !== "solid" && selection.kind !== "face" && selection.kind !== "surface") {
      throw new Error("OCCT backend: split body tool selector must resolve to solid/face/surface");
    }
  }

  const tools = uniqueSelectionShapes(ctx, toolSelections as KernelSelection[]);
  if (tools.length === 0) {
    throw new Error("OCCT backend: split body tool selector resolved no shapes");
  }

  // keepTool is accepted by IR/DSL but does not alter output wiring yet.
  let split = ctx.splitByTools(sourceOwner, tools);
  split = ctx.unifySameDomain(split);
  if (!ctx.isValidShape(split)) {
    throw new Error("OCCT backend: split body produced invalid result");
  }

  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:solid`,
        kind: "solid" as const,
        meta: { shape: split },
      },
    ],
  ]);
  const selections = ctx.collectSelections(split, feature.id, feature.result, feature.tags, {
    ledgerPlan: ctx.makeFaceMutationSelectionLedgerPlan(upstream, sourceOwner, []),
  });
  return { outputs, selections };
}

export function execSplitFace(ctx: FaceEditContext, feature: SplitFace, upstream: KernelResult): KernelResult {
  const faceSelections = resolveSelectorSet(feature.faces, ctx.toResolutionContext(upstream));
  if (faceSelections.length === 0) {
    throw new Error("OCCT backend: split face selector matched 0 entities");
  }
  for (const selection of faceSelections) {
    if (selection.kind !== "face") {
      throw new Error("OCCT backend: split face selector must resolve to faces");
    }
  }

  const ownerKeys = new Set<string>();
  for (const selection of faceSelections) {
    ownerKeys.add(ctx.resolveOwnerKey(selection as KernelSelection, upstream));
  }
  if (ownerKeys.size !== 1) {
    throw new Error("OCCT backend: split face selector must resolve to a single owner");
  }

  const ownerKey = ctx.resolveOwnerKey(faceSelections[0] as KernelSelection, upstream);
  const ownerShape = ctx.resolveOwnerShape(faceSelections[0] as KernelSelection, upstream);
  if (!ownerShape) {
    throw new Error("OCCT backend: split face target must resolve to an owner shape");
  }

  const toolSelections = resolveSelectorSet(feature.tool, ctx.toResolutionContext(upstream));
  if (toolSelections.length === 0) {
    throw new Error("OCCT backend: split face tool selector matched 0 entities");
  }
  for (const selection of toolSelections) {
    if (selection.kind !== "solid" && selection.kind !== "face" && selection.kind !== "surface") {
      throw new Error("OCCT backend: split face tool selector must resolve to solid/face/surface");
    }
  }

  const tools = uniqueSelectionShapes(ctx, toolSelections as KernelSelection[]);
  if (tools.length === 0) {
    throw new Error("OCCT backend: split face tool selector resolved no shapes");
  }

  // Initial implementation splits at owner-shape scope and returns the split owner.
  let split = ctx.splitByTools(ownerShape, tools);
  split = ctx.unifySameDomain(split);
  if (!ctx.isValidShape(split)) {
    throw new Error("OCCT backend: split face produced invalid result");
  }

  const outputKind: "solid" | "face" = ctx.shapeHasSolid(split) ? "solid" : "face";
  const outputs = new Map([
    [
      feature.result,
      {
        id: `${feature.id}:${outputKind}`,
        kind: outputKind,
        meta: { shape: split },
      },
    ],
  ]);
  const selections = ctx.collectSelections(
    split,
    feature.id,
    outputKind === "solid" ? feature.result : ownerKey,
    feature.tags,
    {
      rootKind: outputKind === "solid" ? "solid" : "face",
      ledgerPlan: ctx.makeSplitFaceSelectionLedgerPlan(upstream, ownerShape, faceSelections),
    }
  );
  return { outputs, selections };
}
