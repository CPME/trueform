import type { KernelResult } from "../backend.js";
import type { ID, Sketch2D, SketchEntity } from "../ir.js";
import type { SketchContext } from "./operation_contexts.js";

export function execSketch(
  ctx: SketchContext,
  feature: Sketch2D,
  upstream: KernelResult,
  resolve: (selector: any, upstream: KernelResult) => any
): KernelResult {
  const outputs = new Map<
    string,
    { id: string; kind: "profile"; meta: Record<string, unknown> }
  >();
  const entityMap = new Map<ID, SketchEntity>();
  for (const entity of feature.entities ?? []) {
    entityMap.set(entity.id, entity);
  }
  const needsPlane = feature.profiles.some((entry) => entry.profile.kind === "profile.sketch");
  const plane = needsPlane ? ctx.resolveSketchPlane(feature, upstream, resolve) : null;

  for (const entry of feature.profiles) {
    if (entry.profile.kind === "profile.sketch") {
      if (!plane) {
        throw new Error("OCCT backend: missing sketch plane for profile.sketch");
      }
      const allowOpen = entry.profile.open === true;
      const { wire, closed } = ctx.buildSketchWireWithStatus(
        entry.profile.loop,
        entityMap,
        plane,
        allowOpen
      );
      const wireSegmentSlots = ctx.segmentSlotsForLoop(entry.profile.loop, entityMap, plane);
      const holes = allowOpen
        ? []
        : (entry.profile.holes ?? []).map((hole) => ctx.buildSketchWire(hole, entityMap, plane));
      const face = allowOpen ? undefined : ctx.buildSketchProfileFaceFromWires(wire, holes);
      outputs.set(entry.name, {
        id: `${feature.id}:${entry.name}`,
        kind: "profile",
        meta: {
          profile: entry.profile,
          face,
          wire,
          wireClosed: closed,
          planeNormal: plane.normal,
          wireSegmentSlots,
        },
      });
      continue;
    }
    outputs.set(entry.name, {
      id: `${feature.id}:${entry.name}`,
      kind: "profile",
      meta: { profile: entry.profile },
    });
  }

  return { outputs, selections: [] };
}
