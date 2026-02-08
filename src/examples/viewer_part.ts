import { part } from "../dsl/core.js";
import {
  booleanOp,
  extrude,
  profileCircle,
  profileRect,
  selectorNamed,
} from "../dsl/geometry.js";

const baseRadius = 55;
const baseThickness = 12;
const wallRadius = 45;
const wallHeight = 30;
const wallOverlap = 2;
const wallBaseZ = baseThickness - wallOverlap;
const flangeRadius = 52;
const flangeThickness = 6;
const flangeOverlap = 1;
const flangeBaseZ = baseThickness + wallHeight - flangeOverlap;
const innerRadius = 32;

const bossWidth = 36;
const bossDepth = 28;
const bossHeight = 22;
const bossInset = 6;
const bossCenterX = wallRadius - bossInset + bossWidth / 2;

const windowFrame = 4;
const windowWidth = bossWidth - windowFrame * 2 + 10;
const windowDepth = bossDepth - windowFrame * 2;
const windowCenterX = bossCenterX - 5;

const holeRadius = 3.5;
const holeCount = 6;
const holeCircleRadius = 44;
const topZ = baseThickness + wallHeight + flangeThickness;
const holeDepth = flangeThickness + 2;

const holeTools = Array.from({ length: holeCount }, (_, idx) => {
  const angle = (idx / holeCount) * Math.PI * 2;
  const x = Math.cos(angle) * holeCircleRadius;
  const y = Math.sin(angle) * holeCircleRadius;
  return extrude(
    `bolt-hole-tool-${idx + 1}`,
    profileCircle(holeRadius, [x, y, topZ]),
    -holeDepth,
    `body:bolt-hole-${idx + 1}`
  );
});

export const viewerPart = part("flanged-housing", [
  extrude(
    "base-disc",
    profileCircle(baseRadius, [0, 0, 0]),
    baseThickness,
    "body:base"
  ),
  extrude(
    "wall",
    profileCircle(wallRadius, [0, 0, wallBaseZ]),
    wallHeight + wallOverlap,
    "body:wall"
  ),
  extrude(
    "flange",
    profileCircle(flangeRadius, [0, 0, flangeBaseZ]),
    flangeThickness + flangeOverlap,
    "body:flange"
  ),
  booleanOp(
    "union-wall-flange",
    "union",
    selectorNamed("body:wall"),
    selectorNamed("body:flange"),
    "body:upper",
    ["wall", "flange"]
  ),
  booleanOp(
    "union-base-upper",
    "union",
    selectorNamed("body:base"),
    selectorNamed("body:upper"),
    "body:outer",
    ["base-disc", "union-wall-flange"]
  ),
  extrude(
    "boss",
    profileRect(bossWidth, bossDepth, [bossCenterX, 0, baseThickness - 1]),
    bossHeight + 1,
    "body:boss"
  ),
  booleanOp(
    "union-boss",
    "union",
    selectorNamed("body:outer"),
    selectorNamed("body:boss"),
    "body:bossed",
    ["union-base-upper", "boss"]
  ),
  extrude(
    "cavity-tool",
    profileCircle(innerRadius, [0, 0, baseThickness]),
    wallHeight + flangeThickness,
    "body:cavity-tool"
  ),
  booleanOp(
    "cut-cavity",
    "subtract",
    selectorNamed("body:bossed"),
    selectorNamed("body:cavity-tool"),
    "body:cavity",
    ["union-boss", "cavity-tool"]
  ),
  extrude(
    "window-tool",
    profileRect(windowWidth, windowDepth, [windowCenterX, 0, baseThickness + 2]),
    bossHeight - 4,
    "body:window-tool"
  ),
  booleanOp(
    "cut-window",
    "subtract",
    selectorNamed("body:cavity"),
    selectorNamed("body:window-tool"),
    "body:windowed",
    ["cut-cavity", "window-tool"]
  ),
  ...holeTools,
  booleanOp(
    "cut-hole-1",
    "subtract",
    selectorNamed("body:windowed"),
    selectorNamed("body:bolt-hole-1"),
    "body:holes-1",
    ["cut-window", "bolt-hole-tool-1"]
  ),
  booleanOp(
    "cut-hole-2",
    "subtract",
    selectorNamed("body:holes-1"),
    selectorNamed("body:bolt-hole-2"),
    "body:holes-2",
    ["cut-hole-1", "bolt-hole-tool-2"]
  ),
  booleanOp(
    "cut-hole-3",
    "subtract",
    selectorNamed("body:holes-2"),
    selectorNamed("body:bolt-hole-3"),
    "body:holes-3",
    ["cut-hole-2", "bolt-hole-tool-3"]
  ),
  booleanOp(
    "cut-hole-4",
    "subtract",
    selectorNamed("body:holes-3"),
    selectorNamed("body:bolt-hole-4"),
    "body:holes-4",
    ["cut-hole-3", "bolt-hole-tool-4"]
  ),
  booleanOp(
    "cut-hole-5",
    "subtract",
    selectorNamed("body:holes-4"),
    selectorNamed("body:bolt-hole-5"),
    "body:holes-5",
    ["cut-hole-4", "bolt-hole-tool-5"]
  ),
  booleanOp(
    "cut-hole-6",
    "subtract",
    selectorNamed("body:holes-5"),
    selectorNamed("body:bolt-hole-6"),
    "body:main",
    ["cut-hole-5", "bolt-hole-tool-6"]
  ),
]);
