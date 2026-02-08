import type {
  ID,
  RefFrame,
  RefSurface,
  Scalar,
  Selector,
  SurfaceProfileConstraint,
} from "../dsl.js";
import { compact } from "./utils.js";

export const refSurface = (selector: Selector): RefSurface => ({
  kind: "ref.surface",
  selector,
});

export const refFrame = (selector: Selector): RefFrame => ({
  kind: "ref.frame",
  selector,
});

export const surfaceProfileConstraint = (
  id: ID,
  target: RefSurface,
  tolerance: Scalar,
  opts?: {
    referenceFrame?: RefFrame;
    capabilities?: ID[];
    requirement?: ID;
  }
): SurfaceProfileConstraint =>
  compact({
    id,
    kind: "constraint.surfaceProfile",
    target,
    tolerance,
    referenceFrame: opts?.referenceFrame,
    capabilities: opts?.capabilities,
    requirement: opts?.requirement,
  });
