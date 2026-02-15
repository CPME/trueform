import { part } from "../dsl/core.js";
import type { IntentPart } from "../dsl.js";
import type { MeshOptions } from "../backend.js";
import {
  booleanOp,
  draft,
  loft,
  sweep,
  chamfer,
  datumPlane,
  extrude,
  fillet,
  hole,
  mirror,
  shell,
  planeDatum,
  predCreatedBy,
  predPlanar,
  predNormal,
  pathPolyline,
  patternLinear,
  profileCircle,
  profilePoly,
  profileRect,
  profileRef,
  profileSketchLoop,
  rankMinZ,
  rankMaxZ,
  rankMaxArea,
  revolve,
  selectorEdge,
  selectorFace,
  selectorNamed,
  sketch2d,
  sketchLine,
  sketchRectCenter,
  sketchRectCorner,
  surface,
  thicken,
  thread,
} from "../dsl/geometry.js";
import {
  datumFeature,
  datumRef,
  cosmeticThread,
  flatnessConstraint,
  parallelismConstraint,
  perpendicularityConstraint,
  positionConstraint,
  refAxis,
  refFrame,
  refSurface,
  sizeConstraint,
  surfaceProfileConstraint,
} from "../dsl/tolerancing.js";
import {
  featureArray,
  featureArrayAlongSpline,
  featureCircularArray,
  featureRadialArray,
} from "../dsl/generators.js";

export type DslFeatureExample = {
  id: string;
  title: string;
  part: IntentPart;
  render?: {
    meshOpts?: MeshOptions;
    renderOpts?: {
      width?: number;
      height?: number;
      padding?: number;
      viewDir?: [number, number, number];
      background?: [number, number, number];
      backgroundAlpha?: number;
      lightDir?: [number, number, number];
      ambient?: number;
      diffuse?: number;
    };
    layers?: Array<{
      output: string;
      color?: [number, number, number];
      alpha?: number;
      wireframe?: boolean;
      wireColor?: [number, number, number];
      wireDepthTest?: boolean;
      depthTest?: boolean;
    }>;
  };
};

export const dslFeatureExamples: DslFeatureExample[] = [
  {
    id: "extrude",
    title: "Extrude",
    part: part("example-extrude", [
      extrude("base", profileRect(80, 50), 12, "body:main"),
    ]),
  },
  {
    id: "revolve",
    title: "Revolve",
    part: part("example-revolve", [
      revolve(
        "ring-revolve",
        profileRect(3, 6, [1.5, 3, 0]),
        "+X",
        "full",
        "body:main"
      ),
    ]),
  },
  {
    id: "loft",
    title: "Loft",
    part: part("example-loft", [
      loft(
        "loft-1",
        [
          profileCircle(10, [0, 0, 0]),
          profilePoly(6, 16, [0, 0, 24], Math.PI / 6),
        ],
        "body:main"
      ),
    ]),
  },
  {
    id: "sweep",
    title: "Sweep (Surface)",
    part: (() => {
      const line = sketchLine("line-1", [-8, 0], [8, 0]);
      const sketch = sketch2d(
        "sketch-sweep",
        [
          {
            name: "profile:line",
            profile: profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { entities: [line] }
      );
      const path = pathPolyline([
        [0, 0, 0],
        [0, 0, 20],
        [15, 0, 30],
      ]);
      return part("example-sweep", [
        sketch,
        sweep(
          "sweep-1",
          profileRef("profile:line"),
          path,
          "surface:main",
          undefined,
          { mode: "surface" }
        ),
      ]);
    })(),
    render: {
      layers: [
        {
          output: "surface:main",
          color: [154, 192, 230],
          alpha: 1,
          wireframe: true,
          wireColor: [32, 40, 52],
          wireDepthTest: true,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "hole",
    title: "Hole",
    part: part("example-hole", [
      extrude("base", profileRect(90, 50), 12, "body:main"),
      hole(
        "hole-1",
        selectorFace([predPlanar()], [rankMaxZ()]),
        "-Z",
        14,
        "throughAll",
        { deps: ["base"] }
      ),
    ]),
  },
  {
    id: "hole-advanced",
    title: "Hole (Counterbore + Countersink)",
    part: part("example-hole-advanced", [
      extrude("base", profileRect(120, 50), 12, "body:main"),
      hole(
        "hole-counterbore",
        selectorFace([predPlanar()], [rankMaxZ()]),
        "-Z",
        8,
        "throughAll",
        {
          counterbore: { diameter: 16, depth: 4 },
          position: [-30, 0],
          deps: ["base"],
        }
      ),
      hole(
        "hole-countersink",
        selectorFace([predPlanar()], [rankMaxZ()]),
        "-Z",
        8,
        "throughAll",
        {
          countersink: { diameter: 18, angle: Math.PI / 2 },
          position: [30, 0],
          deps: ["hole-counterbore"],
        }
      ),
    ]),
  },
  {
    id: "fillet",
    title: "Fillet",
    part: part("example-fillet", [
      extrude("cyl", profileCircle(14), 28, "body:main"),
      fillet(
        "edge-fillet",
        selectorEdge([predCreatedBy("cyl")], [rankMaxZ()]),
        3,
        ["cyl"]
      ),
    ]),
  },
  {
    id: "chamfer",
    title: "Chamfer",
    part: part("example-chamfer", [
      extrude("block", profileRect(40, 26), 12, "body:main"),
      chamfer(
        "edge-chamfer",
        selectorEdge([predCreatedBy("block")]),
        2,
        ["block"]
      ),
    ]),
  },
  {
    id: "boolean",
    title: "Boolean Union",
    part: part("example-boolean", [
      extrude("base", profileRect(50, 26), 12, "body:base"),
      extrude(
        "tool",
        profileRect(26, 26, [12, 0, 0]),
        12,
        "body:tool"
      ),
      booleanOp(
        "union-1",
        "union",
        selectorNamed("body:base"),
        selectorNamed("body:tool"),
        "body:main",
        ["base", "tool"]
      ),
    ]),
  },
  {
    id: "pattern",
    title: "Pattern (Feature/Body)",
    part: part("example-pattern", [
      extrude("seed", profileRect(10, 10), 8, "body:seed"),
      patternLinear(
        "pattern-1",
        selectorFace([predCreatedBy("seed"), predPlanar(), predNormal("+Z")], [rankMaxZ()]),
        [18, 0],
        [4, 1],
        {
          source: selectorNamed("body:seed"),
          result: "body:main",
          deps: ["seed"],
        }
      ),
    ]),
  },
  {
    id: "feature-array",
    title: "Feature Array",
    part: (() => {
      const baseThickness = 6;
      const bossHeight = 8;
      const bossSize = 16;
      const base = extrude(
        "base",
        profileRect(120, 80, [0, 0, 0]),
        baseThickness,
        "body:base"
      );
      const cubes = featureArray(
        {
          count: [3, 2],
          spacing: [36, 36],
          origin: [-36, -18, baseThickness],
        },
        ({ index, offset }) =>
          extrude(
            `cube-${index}`,
            profileRect(bossSize, bossSize, offset),
            bossHeight,
            `body:cube-${index}`
          )
      );

      const unions = [];
      let current = "body:base";
      for (let i = 0; i < cubes.length; i += 1) {
        const result = i === cubes.length - 1 ? "body:main" : `body:union-${i}`;
        unions.push(
          booleanOp(
            `union-${i}`,
            "union",
            selectorNamed(current),
            selectorNamed(`body:cube-${i}`),
            result
          )
        );
        current = result;
      }

      return part("example-feature-array", [base, ...cubes, ...unions]);
    })(),
  },
  {
    id: "tolerancing",
    title: "Tolerancing (PMI)",
    part: (() => {
      const base = extrude(
        "base",
        profileRect(120, 70, [0, 0, 0]),
        12,
        "body:main"
      );
      const topFace = selectorFace([predPlanar(), predNormal("+Z")], [rankMaxZ()]);
      const bottomFace = selectorFace([predPlanar(), predNormal("-Z")], [rankMinZ()]);
      const sideFace = selectorFace([predPlanar(), predNormal("+X")]);

      const holeTool = hole(
        "hole-1",
        topFace,
        "-Z",
        10,
        "throughAll",
        { deps: ["base"] }
      );
      const holeFace = selectorFace([predCreatedBy("hole-1")], [rankMaxArea()]);

      return part("example-tolerancing", [base, holeTool], {
        datums: [
          datumFeature("datum-A", "A", refSurface(bottomFace)),
          datumFeature("datum-B", "B", refSurface(sideFace)),
        ],
        constraints: [
          flatnessConstraint("flat-top", refSurface(topFace), 0.05, {
            requirement: "req-flat-top",
          }),
          parallelismConstraint(
            "parallel-top",
            refSurface(topFace),
            0.08,
            [datumRef("datum-A")]
          ),
          perpendicularityConstraint(
            "perp-side",
            refSurface(sideFace),
            0.1,
            [datumRef("datum-A")]
          ),
          positionConstraint(
            "pos-hole",
            refAxis(holeFace),
            0.2,
            [datumRef("datum-A"), datumRef("datum-B")],
            { zone: "diameter", modifiers: ["MMC"] }
          ),
          sizeConstraint("size-hole", refAxis(holeFace), {
            nominal: 10,
            tolerance: 0.1,
            modifiers: ["MMC"],
          }),
          surfaceProfileConstraint("profile-top", refSurface(topFace), 0.03, {
            referenceFrame: refFrame(topFace),
            requirement: "req-profile-top",
            capabilities: ["mill-3axis"],
          }),
        ],
      });
    })(),
  },
  {
    id: "spline-array",
    title: "Spline Array",
    part: (() => {
      const baseThickness = 6;
      const bossHeight = 8;
      const bossSize = 12;
      const base = extrude(
        "base",
        profileRect(160, 90, [0, 0, 0]),
        baseThickness,
        "body:base"
      );
      const bosses = featureArrayAlongSpline(
        {
          points: [
            [-60, -20, baseThickness],
            [-30, 25, baseThickness],
            [20, -10, baseThickness],
            [60, 30, baseThickness],
          ],
          count: 7,
          mode: "spline",
        },
        ({ index, offset }) =>
          extrude(
            `boss-${index}`,
            profileRect(bossSize, bossSize, offset),
            bossHeight,
            `body:boss-${index}`
          )
      );

      const unions = [];
      let current = "body:base";
      for (let i = 0; i < bosses.length; i += 1) {
        const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
        unions.push(
          booleanOp(
            `union-${i}`,
            "union",
            selectorNamed(current),
            selectorNamed(`body:boss-${i}`),
            result
          )
        );
        current = result;
      }

      return part("example-spline-array", [base, ...bosses, ...unions]);
    })(),
  },
  {
    id: "circular-array",
    title: "Circular Array",
    part: (() => {
      const baseThickness = 6;
      const bossHeight = 8;
      const bossRadius = 6;
      const base = extrude(
        "base",
        profileRect(140, 100, [0, 0, 0]),
        baseThickness,
        "body:base"
      );
      const bosses = featureCircularArray(
        {
          count: 8,
          radius: 36,
          center: [0, 0, baseThickness],
          units: "deg",
        },
        ({ index, offset }) =>
          extrude(
            `boss-${index}`,
            profileCircle(bossRadius, offset),
            bossHeight,
            `body:boss-${index}`
          )
      );

      const unions = [];
      let current = "body:base";
      for (let i = 0; i < bosses.length; i += 1) {
        const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
        unions.push(
          booleanOp(
            `union-${i}`,
            "union",
            selectorNamed(current),
            selectorNamed(`body:boss-${i}`),
            result
          )
        );
        current = result;
      }

      return part("example-circular-array", [base, ...bosses, ...unions]);
    })(),
  },
  {
    id: "radial-array",
    title: "Radial Array",
    part: (() => {
      const baseThickness = 6;
      const bossHeight = 8;
      const bossSize = 10;
      const base = extrude(
        "base",
        profileRect(160, 110, [0, 0, 0]),
        baseThickness,
        "body:base"
      );
      const bosses = featureRadialArray(
        {
          count: [6, 3],
          radiusStep: 18,
          radiusStart: 18,
          center: [0, 0, baseThickness],
          angleStep: 60,
          units: "deg",
        },
        ({ index, offset }) =>
          extrude(
            `boss-${index}`,
            profileRect(bossSize, bossSize, offset),
            bossHeight,
            `body:boss-${index}`
          )
      );

      const unions = [];
      let current = "body:base";
      for (let i = 0; i < bosses.length; i += 1) {
        const result = i === bosses.length - 1 ? "body:main" : `body:union-${i}`;
        unions.push(
          booleanOp(
            `union-${i}`,
            "union",
            selectorNamed(current),
            selectorNamed(`body:boss-${i}`),
            result
          )
        );
        current = result;
      }

      return part("example-radial-array", [base, ...bosses, ...unions]);
    })(),
  },
  {
    id: "mirror",
    title: "Mirror",
    part: (() => {
      const rect = sketchRectCenter("rect-1", [26, 0], 60, 10, {
        rotation: Math.PI / 5,
      });
      const sketch = sketch2d(
        "sketch-v",
        [{ name: "profile:bar", profile: profileSketchLoop(["rect-1"]) }],
        { entities: [rect] }
      );
      return part("example-mirror", [
        sketch,
        extrude("bar", profileRef("profile:bar"), 6, "body:base"),
        datumPlane("mirror-plane", "+X"),
        mirror(
          "mirror-1",
          selectorNamed("body:base"),
          planeDatum("mirror-plane"),
          "body:mirror"
        ),
        booleanOp(
          "union-1",
          "union",
          selectorNamed("body:base"),
          selectorNamed("body:mirror"),
          "body:main"
        ),
      ]);
    })(),
  },
  {
    id: "draft",
    title: "Draft",
    part: part("example-draft", [
      extrude("base", profileRect(60, 40), 20, "body:base"),
      datumPlane("draft-neutral", "+Z"),
      draft(
        "draft-1",
        selectorNamed("body:base"),
        selectorFace([
          predCreatedBy("base"),
          predPlanar(),
          predNormal("+X"),
        ]),
        planeDatum("draft-neutral"),
        "+Z",
        Math.PI / 18,
        "body:main",
        ["base", "draft-neutral"]
      ),
    ]),
  },
  {
    id: "thicken",
    title: "Thicken",
    part: (() => {
      const line = sketchLine("line-1", [10, 0], [10, 16]);
      const sketch = sketch2d(
        "sketch-thicken",
        [
          {
            name: "profile:open",
            profile: profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { plane: planeDatum("sketch-plane"), entities: [line] }
      );
      return part("example-thicken", [
        datumPlane("sketch-plane", "+Y"),
        sketch,
        revolve(
          "surface-revolve",
          profileRef("profile:open"),
          "+Z",
          "full",
          "surface:main",
          { mode: "surface" }
        ),
        thicken("thicken-1", selectorNamed("surface:main"), 4, "body:main"),
      ]);
    })(),
    render: {
      layers: [
        {
          output: "body:main",
          color: [154, 192, 230],
          alpha: 1,
          wireframe: false,
          depthTest: true,
        },
        {
          output: "surface:main",
          color: [90, 120, 160],
          alpha: 0.25,
          wireframe: true,
          wireColor: [32, 40, 52],
          wireDepthTest: true,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "shell-before",
    title: "Shell (Before)",
    part: part("example-shell-before", [
      extrude("base", profileRect(60, 40), 20, "body:base"),
    ]),
    render: {
      layers: [
        {
          output: "body:base",
          color: [140, 150, 160],
          alpha: 1,
          wireframe: true,
          wireColor: [20, 30, 40],
          wireDepthTest: true,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "shell-after",
    title: "Shell (After)",
    part: part("example-shell-after", [
      extrude("base", profileRect(60, 40), 20, "body:base"),
      shell("shell-1", selectorNamed("body:base"), 2, "body:main", undefined, {
        direction: "inside",
        openFaces: [
          selectorFace(
            [predCreatedBy("base"), predPlanar(), predNormal("+Z")],
            [rankMaxArea()]
          ),
        ],
      }),
    ]),
    render: {
      layers: [
        {
          output: "body:main",
          color: [118, 170, 220],
          alpha: 1,
          wireframe: true,
          wireColor: [20, 30, 40],
          wireDepthTest: true,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "shell",
    title: "Shell",
    part: part("example-shell", [
      extrude("base", profileRect(60, 40), 20, "body:base"),
      shell("shell-1", selectorNamed("body:base"), 2, "body:main", undefined, {
        direction: "inside",
        openFaces: [
          selectorFace(
            [predCreatedBy("base"), predPlanar(), predNormal("+Z")],
            [rankMaxArea()]
          ),
        ],
      }),
    ]),
    render: {
      layers: [
        {
          output: "body:main",
          color: [118, 170, 220],
          alpha: 0.4,
          wireframe: false,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "thread",
    title: "Thread",
    part: part("example-thread", [
      thread("thread-1", "+Z", 24, 22, 3.5, "body:main", undefined, {
        segmentsPerTurn: 24,
      }),
    ]),
    render: {
      meshOpts: {
        linearDeflection: 0.1,
        angularDeflection: 0.2,
      },
    },
  },
  {
    id: "thread-cosmetic",
    title: "Cosmetic Thread",
    part: part(
      "example-thread-cosmetic",
      [extrude("base", profileCircle(10), 24, "body:main")],
      {
        cosmeticThreads: [
          cosmeticThread(
            "thread-1",
            refSurface(selectorFace([predCreatedBy("base")], [rankMaxArea()])),
            {
              designation: "M8x1.25-6H",
              internal: true,
              length: 12,
            }
          ),
        ],
      }
    ),
  },
];
