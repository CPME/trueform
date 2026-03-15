import { part } from "../dsl/core.js";
import type { IntentPart } from "../dsl.js";
import type { MeshOptions } from "../backend.js";
import {
  axisVector,
  booleanOp,
  draft,
  loft,
  rib,
  sweep,
  web,
  chamfer,
  variableChamfer,
  datumPlane,
  extrude,
  fillet,
  variableFillet,
  hole,
  plane,
  mirror,
  moveBody,
  moveFace,
  deleteFace,
  replaceFace,
  shell,
  planeDatum,
  predCreatedBy,
  predPlanar,
  predNormal,
  pathPolyline,
  pathSpline,
  patternCircular,
  patternLinear,
  pipe,
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
  sketchProfileLoop,
  sketchRectCorner,
  surface,
  curveIntersect,
  thicken,
  unwrap,
} from "../dsl/geometry.js";
import { cut, intersect } from "../dsl/booleans.js";
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
    selectionHighlights?: Array<{
      selectionId: string;
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
    id: "selection-ledger-extrude-review",
    title: "Selection Ledger Extrude Review",
    part: (() => {
      const sketch = sketch2d(
        "sketch-review-extrude",
        [
          {
            name: "profile:loop",
            profile: profileSketchLoop([
              "line-1",
              "line-2",
              "line-3",
              "line-4",
            ]),
          },
        ],
        {
          entities: [
            sketchLine("line-1", [0, 0], [36, 0]),
            sketchLine("line-2", [36, 0], [36, 24]),
            sketchLine("line-3", [36, 24], [0, 24]),
            sketchLine("line-4", [0, 24], [0, 0]),
          ],
        }
      );
      return part("selection-ledger-extrude-review", [
        sketch,
        extrude("review-extrude", profileRef("profile:loop"), 18, "body:main"),
      ]);
    })(),
    render: {
      meshOpts: {
        linearDeflection: 0.12,
        angularDeflection: 0.12,
        parallel: true,
      },
      renderOpts: {
        viewDir: [1.4, -1.2, 0.95],
      },
      layers: [
        {
          output: "body:main",
          color: [196, 214, 232],
          alpha: 0.82,
          wireframe: true,
          wireColor: [28, 36, 48],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "surface",
    title: "Surface",
    part: (() => {
      const rect = sketchRectCorner("rect-1", [0, 0], 40, 20);
      const sketch = sketch2d(
        "sketch-face",
        [{ name: "profile:rect", profile: profileSketchLoop(["rect-1"]) }],
        { entities: [rect] }
      );
      return part("example-surface", [
        sketch,
        surface("face-1", profileRef("profile:rect"), "surface:main"),
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
    id: "extrude-surface",
    title: "Extrude (Surface)",
    part: (() => {
      const line = sketchLine("line-1", [0, 0], [30, 0]);
      const sketch = sketch2d(
        "sketch-extrude-surface",
        [
          {
            name: "profile:open",
            profile: profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        { origin: [0, 0, 0], entities: [line] }
      );
      return part("example-extrude-surface", [
        sketch,
        extrude(
          "surface-extrude",
          profileRef("profile:open"),
          10,
          "surface:wall",
          undefined,
          { mode: "surface" }
        ),
      ]);
    })(),
    render: {
      layers: [
        {
          output: "surface:wall",
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
    id: "curve-intersect",
    title: "Curve Intersect (Staging)",
    part: (() => {
      const line = sketchLine("line-1", [10, 0], [10, 16]);
      const sketch = sketch2d(
        "sketch-curve-intersect",
        [
          {
            name: "profile:wall",
            profile: profileSketchLoop(["line-1"], { open: true }),
          },
        ],
        {
          plane: planeDatum("sketch-plane"),
          entities: [line],
        }
      );
      return part("example-curve-intersect", [
        datumPlane("sketch-plane", "+Y"),
        sketch,
        revolve(
          "surface-revolve",
          profileRef("profile:wall"),
          "+Z",
          "full",
          "surface:cylinder",
          { mode: "surface" }
        ),
        datumPlane("cut-plane", axisVector([0, 1, 1]), [0, 0, 8]),
        plane("cut-face", 80, 80, "surface:cut", {
          plane: planeDatum("cut-plane"),
          deps: ["cut-plane"],
        }),
        curveIntersect(
          "curve-intersect-1",
          selectorNamed("surface:cylinder"),
          selectorNamed("surface:cut"),
          "curve:main"
        ),
      ]);
    })(),
    render: {
      layers: [
        {
          output: "surface:cylinder",
          color: [154, 192, 230],
          alpha: 0.28,
          wireframe: true,
          wireColor: [58, 74, 96],
          wireDepthTest: true,
          depthTest: true,
        },
        {
          output: "surface:cut",
          color: [214, 225, 236],
          alpha: 0.2,
          wireframe: true,
          wireColor: [92, 108, 126],
          wireDepthTest: true,
          depthTest: true,
        },
        {
          output: "curve:main",
          color: [219, 94, 78],
          alpha: 1,
          wireframe: true,
          wireColor: [219, 94, 78],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
    },
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
    id: "selection-ledger-revolve-review",
    title: "Selection Ledger Revolve Review",
    part: (() => {
      const sketch = sketch2d(
        "sketch-review-revolve",
        [
          {
            name: "profile:loop",
            profile: profileSketchLoop([
              "line-1",
              "line-2",
              "line-3",
              "line-4",
            ]),
          },
        ],
        {
          entities: [
            sketchLine("line-1", [8, 0], [20, 0]),
            sketchLine("line-2", [20, 0], [20, 14]),
            sketchLine("line-3", [20, 14], [8, 14]),
            sketchLine("line-4", [8, 14], [8, 0]),
          ],
        }
      );
      return part("selection-ledger-revolve-review", [
        sketch,
        revolve(
          "review-revolve",
          profileRef("profile:loop"),
          "+Y",
          Math.PI,
          "body:main"
        ),
      ]);
    })(),
    render: {
      meshOpts: {
        linearDeflection: 0.12,
        angularDeflection: 0.12,
        parallel: true,
      },
      renderOpts: {
        viewDir: [1.25, -1.05, 0.9],
      },
      layers: [
        {
          output: "body:main",
          color: [210, 222, 198],
          alpha: 0.78,
          wireframe: true,
          wireColor: [36, 44, 32],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
    },
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
    id: "pipe",
    title: "Pipe",
    part: part("example-pipe", [
      pipe("pipe-1", "+Z", 60, 24, 18, "body:main"),
    ]),
  },
  {
    id: "rib-web",
    title: "Rib/Web (Staging)",
    part: (() => {
      const ribLine = sketchLine("rib-line", [-4, -20], [-22, -34]);
      const webLine = sketchLine("web-line", [-12, -36], [16, -20]);
      const ribSketch = sketch2d(
        "rib-sketch",
        [
          { name: "profile:rib", profile: profileSketchLoop(["rib-line"], { open: true }) },
          { name: "profile:web", profile: profileSketchLoop(["web-line"], { open: true }) },
        ],
        {
          plane: planeDatum("dp-front"),
          deps: ["dp-front", "support-union"],
          entities: [ribLine, webLine],
        }
      );
      return part("example-rib-web", [
        extrude("base", profileRect(84, 40), 20, "body:base"),
        extrude("tower", profileRect(20, 40, [-32, 0, 0]), 44, "body:tower"),
        booleanOp(
          "support-union",
          "union",
          selectorNamed("body:base"),
          selectorNamed("body:tower"),
          "body:support"
        ),
        datumPlane("dp-front", "+Y"),
        ribSketch,
        rib("rib-1", profileRef("profile:rib"), 3, 80, "body:rib", ["support-union", "rib-sketch"], {
          side: "oneSided",
        }),
        web("web-1", profileRef("profile:web"), 2, 80, "body:web", ["support-union", "rib-sketch"], {
          side: "symmetric",
        }),
        booleanOp(
          "union-rib",
          "union",
          selectorNamed("body:support"),
          selectorNamed("body:rib"),
          "body:ribbed"
        ),
        booleanOp(
          "union-rib-web",
          "union",
          selectorNamed("body:ribbed"),
          selectorNamed("body:web"),
          "body:main"
        ),
      ]);
    })(),
    render: {
      renderOpts: {
        viewDir: [0.8, -0.6, 0.5],
      },
    },
  },
  {
    id: "sweep-sketch",
    title: "Sweep (Arbitrary Sketch)",
    part: (() => {
      const l1 = sketchLine("line-1", [-5, -4], [5, -4]);
      const l2 = sketchLine("line-2", [5, -4], [0, 6]);
      const l3 = sketchLine("line-3", [0, 6], [-5, -4]);
      const { sketch, profile } = sketchProfileLoop(
        "sketch-sweep-profile",
        "profile:loop",
        ["line-1", "line-2", "line-3"],
        [l1, l2, l3]
      );
      const path = pathSpline(
        [
          [0, 0, 0],
          [0, 0, 20],
          [14, 8, 34],
          [30, 0, 48],
        ],
        { degree: 3 }
      );
      return part("example-sweep-sketch", [
        sketch,
        sweep(
          "sweep-sketch-1",
          profile,
          path,
          "body:main",
          undefined,
          { orientation: "frenet" }
        ),
      ]);
    })(),
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
    id: "selection-ledger-fillet-edge-review",
    title: "Selection Ledger Fillet Edge Review",
    part: part("selection-ledger-fillet-edge-review", [
      extrude("cyl", profileCircle(14), 28, "body:main"),
      fillet(
        "review-fillet",
        selectorEdge([predCreatedBy("cyl")], [rankMaxZ()]),
        3,
        ["cyl"]
      ),
    ]),
    render: {
      meshOpts: {
        linearDeflection: 0.12,
        angularDeflection: 0.12,
        parallel: true,
      },
      renderOpts: {
        viewDir: [1.55, -0.35, 0.4],
      },
      layers: [
        {
          output: "body:main",
          color: [221, 205, 186],
          alpha: 0.74,
          wireframe: true,
          wireColor: [40, 34, 28],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
      selectionHighlights: [
        {
          selectionId: "face:body.main~review-fillet.fillet.seed.1",
          color: [34, 197, 94],
          alpha: 0.5,
          wireframe: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~review-fillet.fillet.seed.1.bound.top",
          alpha: 0,
          wireframe: true,
          wireColor: [249, 115, 22],
          wireDepthTest: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~review-fillet.fillet.seed.1.bound.side.1",
          alpha: 0,
          wireframe: true,
          wireColor: [6, 182, 212],
          wireDepthTest: false,
          depthTest: false,
        },
      ],
    },
  },
  {
    id: "selection-ledger-fillet-seam-review",
    title: "Selection Ledger Fillet Seam Review",
    part: part("selection-ledger-fillet-seam-review", [
      extrude("cyl", profileCircle(14), 28, "body:main"),
      fillet(
        "review-fillet-seam",
        selectorEdge([predCreatedBy("cyl")], [rankMaxZ()]),
        3,
        ["cyl"]
      ),
    ]),
    render: {
      meshOpts: {
        linearDeflection: 0.12,
        angularDeflection: 0.12,
        parallel: true,
      },
      renderOpts: {
        viewDir: [1.55, -0.35, 0.4],
      },
      layers: [
        {
          output: "body:main",
          color: [214, 206, 194],
          alpha: 0.74,
          wireframe: true,
          wireColor: [40, 34, 28],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
      selectionHighlights: [
        {
          selectionId: "face:body.main~review-fillet-seam.fillet.seed.1",
          color: [34, 197, 94],
          alpha: 0.5,
          wireframe: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~review-fillet-seam.fillet.seed.1.bound.top",
          alpha: 0,
          wireframe: true,
          wireColor: [249, 115, 22],
          wireDepthTest: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~review-fillet-seam.fillet.seed.1.seam",
          alpha: 0,
          wireframe: true,
          wireColor: [236, 72, 153],
          wireDepthTest: false,
          depthTest: false,
        },
      ],
    },
  },
  {
    id: "variable-fillet",
    title: "Variable Fillet",
    part: part("example-variable-fillet", [
      extrude("base", profileCircle(12), 16, "body:main"),
      variableFillet(
        "fillet-var",
        selectorNamed("body:main"),
        [
          {
            edge: selectorEdge([predCreatedBy("base")], [rankMaxZ()]),
            radius: 1.8,
          },
          {
            edge: selectorEdge([predCreatedBy("base")], [rankMinZ()]),
            radius: 0.9,
          },
        ],
        "body:filleted",
        ["base"]
      ),
    ]),
    render: {
      layers: [
        {
          output: "body:filleted",
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
    id: "selection-ledger-chamfer-edge-review",
    title: "Selection Ledger Chamfer Edge Review",
    part: part("selection-ledger-chamfer-edge-review", [
      extrude("cyl", profileCircle(14), 28, "body:main"),
      chamfer(
        "review-chamfer",
        selectorEdge([predCreatedBy("cyl")], [rankMaxZ()]),
        3,
        ["cyl"]
      ),
    ]),
    render: {
      meshOpts: {
        linearDeflection: 0.12,
        angularDeflection: 0.12,
        parallel: true,
      },
      renderOpts: {
        viewDir: [1.35, -0.78, 0.52],
      },
      layers: [
        {
          output: "body:main",
          color: [198, 215, 196],
          alpha: 0.74,
          wireframe: true,
          wireColor: [30, 44, 32],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
      selectionHighlights: [
        {
          selectionId: "face:body.main~review-chamfer.chamfer.seed.1",
          color: [6, 182, 212],
          alpha: 0.46,
          wireframe: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~review-chamfer.chamfer.seed.1.bound.top",
          alpha: 0,
          wireframe: true,
          wireColor: [249, 115, 22],
          wireDepthTest: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~review-chamfer.chamfer.seed.1.bound.side.1",
          alpha: 0,
          wireframe: true,
          wireColor: [236, 72, 153],
          wireDepthTest: false,
          depthTest: false,
        },
      ],
    },
  },
  {
    id: "selection-ledger-chamfer-join-review",
    title: "Selection Ledger Chamfer Join Review",
    part: part("selection-ledger-chamfer-join-review", [
      extrude("block", profileRect(36, 24), 16, "body:main"),
      chamfer(
        "review-chamfer-join",
        selectorEdge([predCreatedBy("block")], [rankMaxZ()]),
        2,
        ["block"]
      ),
    ]),
    render: {
      meshOpts: {
        linearDeflection: 0.12,
        angularDeflection: 0.12,
        parallel: true,
      },
      renderOpts: {
        viewDir: [1.3, -1.05, 0.72],
      },
      layers: [
        {
          output: "body:main",
          color: [198, 215, 196],
          alpha: 0.78,
          wireframe: true,
          wireColor: [30, 44, 32],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
      selectionHighlights: [
        {
          selectionId: "face:body.main~review-chamfer-join.chamfer.seed.1",
          color: [6, 182, 212],
          alpha: 0.44,
          wireframe: false,
          depthTest: false,
        },
        {
          selectionId: "face:body.main~review-chamfer-join.chamfer.seed.2",
          color: [34, 197, 94],
          alpha: 0.44,
          wireframe: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~review-chamfer-join.chamfer.seed.1.join.chamfer.seed.2",
          alpha: 0,
          wireframe: true,
          wireColor: [236, 72, 153],
          wireDepthTest: false,
          depthTest: false,
        },
      ],
    },
  },
  {
    id: "selection-ledger-stack-audit",
    title: "Selection Ledger Multi-Feature Audit",
    part: (() => {
      const baseSketch = sketch2d(
        "sketch-base-audit",
        [
          {
            name: "profile:base-audit",
            profile: profileSketchLoop(["base-1", "base-2", "base-3", "base-4"]),
          },
        ],
        {
          entities: [
            sketchLine("base-1", [-30, -20], [30, -20]),
            sketchLine("base-2", [30, -20], [30, 20]),
            sketchLine("base-3", [30, 20], [-30, 20]),
            sketchLine("base-4", [-30, 20], [-30, -20]),
          ],
        }
      );
      const bossSketch = sketch2d(
        "sketch-boss-audit",
        [
          {
            name: "profile:boss-audit",
            profile: profileSketchLoop(["boss-1", "boss-2", "boss-3", "boss-4"]),
          },
        ],
        {
          plane: planeDatum("boss-plane-audit"),
          deps: ["boss-plane-audit"],
          entities: [
            sketchLine("boss-1", [-10, -8], [10, -8]),
            sketchLine("boss-2", [10, -8], [10, 8]),
            sketchLine("boss-3", [10, 8], [-10, 8]),
            sketchLine("boss-4", [-10, 8], [-10, -8]),
          ],
        }
      );
      return part("selection-ledger-stack-audit", [
        baseSketch,
        extrude(
          "base",
          profileRef("profile:base-audit"),
          12,
          "body:base",
          ["sketch-base-audit"]
        ),
        datumPlane("boss-plane-audit", "+Z", [0, 0, 12], ["base"]),
        bossSketch,
        extrude(
          "boss",
          profileRef("profile:boss-audit"),
          14,
          "body:boss",
          ["sketch-boss-audit"]
        ),
        fillet(
          "boss-fillet",
          selectorEdge([predCreatedBy("boss")], [rankMaxZ()]),
          2,
          { result: "body:boss-filleted", deps: ["boss"] }
        ),
        booleanOp(
          "union-main",
          "union",
          selectorNamed("body:base"),
          selectorNamed("body:boss-filleted"),
          "body:main",
          ["base", "boss-fillet"]
        ),
      ]);
    })(),
    render: {
      meshOpts: {
        linearDeflection: 0.1,
        angularDeflection: 0.1,
        parallel: true,
      },
      renderOpts: {
        viewDir: [1.54, -1.42, 1.18],
      },
      layers: [
        {
          output: "body:main",
          color: [205, 214, 224],
          alpha: 0.58,
          wireframe: true,
          wireColor: [30, 38, 48],
          wireDepthTest: false,
          depthTest: true,
        },
      ],
      selectionHighlights: [
        {
          selectionId: "face:body.main~union-main.side.base-1",
          color: [234, 179, 8],
          alpha: 0.55,
          wireframe: false,
          depthTest: false,
        },
        {
          selectionId: "face:body.main~union-main.fillet.seed.1",
          color: [34, 197, 94],
          alpha: 0.92,
          wireframe: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.boss~boss.hd02c8fff3fcee9ed.3",
          alpha: 0,
          wireframe: true,
          wireColor: [249, 115, 22],
          wireDepthTest: false,
          depthTest: false,
        },
        {
          selectionId: "edge:body.main~union-main.fillet.seed.1.join.top",
          alpha: 0,
          wireframe: true,
          wireColor: [6, 182, 212],
          wireDepthTest: false,
          depthTest: false,
        },
      ],
    },
  },
  {
    id: "variable-chamfer",
    title: "Variable Chamfer",
    part: part("example-variable-chamfer", [
      extrude("base", profileCircle(12), 16, "body:main"),
      variableChamfer(
        "chamfer-var",
        selectorNamed("body:main"),
        [
          {
            edge: selectorEdge([predCreatedBy("base")], [rankMaxZ()]),
            distance: 1.2,
          },
          {
            edge: selectorEdge([predCreatedBy("base")], [rankMinZ()]),
            distance: 0.6,
          },
        ],
        "body:chamfered",
        ["base"]
      ),
    ]),
    render: {
      layers: [
        {
          output: "body:chamfered",
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
    id: "boolean",
    title: "Boolean Union",
    part: part("example-boolean", [
      extrude("base", profileCircle(18), 12, "body:base"),
      extrude("tool", profileRect(20, 12, [16, 0, 0]), 12, "body:tool"),
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
    id: "boolean-cut",
    title: "Boolean Subtract",
    part: part("example-boolean-cut", [
      extrude("base", profileRect(70, 36), 14, "body:base"),
      extrude(
        "tool",
        profileCircle(10, [10, 0, 0]),
        14,
        "body:tool"
      ),
      cut(
        "subtract-1",
        selectorNamed("body:base"),
        selectorNamed("body:tool"),
        "body:main",
        ["base", "tool"]
      ),
    ]),
  },
  {
    id: "boolean-intersect",
    title: "Boolean Intersect",
    part: part("example-boolean-intersect", [
      extrude("a", profileCircle(16), 26, "body:a"),
      extrude(
        "b",
        profileCircle(16, [12, 0, 0]),
        26,
        "body:b"
      ),
      intersect(
        "intersect-1",
        selectorNamed("body:a"),
        selectorNamed("body:b"),
        "body:main",
        ["a", "b"]
      ),
    ]),
    render: {
      layers: [
        {
          output: "body:a",
          color: [66, 133, 244],
          alpha: 0.2,
          wireframe: false,
          depthTest: false,
        },
        {
          output: "body:b",
          color: [251, 188, 5],
          alpha: 0.2,
          wireframe: false,
          depthTest: false,
        },
        {
          output: "body:main",
          color: [52, 168, 83],
          alpha: 1,
          wireframe: true,
          wireColor: [24, 35, 24],
          wireDepthTest: true,
          depthTest: true,
        },
      ],
    },
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
    id: "pattern-circular",
    title: "Pattern (Circular)",
    part: part("example-pattern-circular", [
      extrude("center", profileCircle(8), 8, "body:center"),
      extrude("seed", profileRect(18, 6, [13, 0, 0]), 8, "body:seed"),
      patternCircular(
        "pattern-circular-1",
        selectorFace(
          [predCreatedBy("center"), predPlanar(), predNormal("+Z")],
          [rankMaxZ()]
        ),
        "+Z",
        6,
        {
          source: selectorNamed("body:seed"),
          result: "body:pattern",
          deps: ["center", "seed"],
        }
      ),
      booleanOp(
        "pattern-circular-union",
        "union",
        selectorNamed("body:center"),
        selectorNamed("body:pattern"),
        "body:main"
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
    part: part("example-mirror", [
      datumPlane("mirror-plane", "+X"),
      plane("mirror-plane-surface", 80, 52, "surface:mirror-plane", {
        plane: planeDatum("mirror-plane"),
      }),
      extrude("rib", profileRect(44, 12, [20, 0, 0]), 8, "body:rib"),
      extrude("boss", profileCircle(10, [34, 12, 0]), 16, "body:boss"),
      booleanOp(
        "half-union",
        "union",
        selectorNamed("body:rib"),
        selectorNamed("body:boss"),
        "body:half"
      ),
      mirror(
        "mirror-1",
        selectorNamed("body:half"),
        planeDatum("mirror-plane"),
        "body:mirror"
      ),
      booleanOp(
        "union-2",
        "union",
        selectorNamed("body:half"),
        selectorNamed("body:mirror"),
        "body:main"
      ),
    ]),
    render: {
      layers: [
        {
          output: "body:main",
          color: [154, 192, 230],
          alpha: 1,
          wireframe: true,
          wireColor: [32, 40, 52],
          wireDepthTest: true,
          depthTest: true,
        },
        {
          output: "surface:mirror-plane",
          color: [230, 140, 70],
          alpha: 0.16,
          wireframe: false,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "move-body",
    title: "Move Body",
    part: part("example-move-body", [
      extrude("base", profileRect(44, 20), 10, "body:base"),
      moveBody(
        "move-1",
        selectorNamed("body:base"),
        "body:moved",
        ["base"],
        {
          translation: [26, 0, 0],
          rotationAxis: "+Z",
          rotationAngle: Math.PI / 18,
          scale: 0.95,
          origin: [0, 0, 0],
        }
      ),
      booleanOp(
        "union-1",
        "union",
        selectorNamed("body:base"),
        selectorNamed("body:moved"),
        "body:main",
        ["move-1"]
      ),
    ]),
  },
  {
    id: "delete-face",
    title: "Delete Face",
    part: part("example-delete-face", [
      extrude("base", profileRect(56, 32), 18, "body:base"),
      deleteFace(
        "delete-top",
        selectorNamed("body:base"),
        selectorFace([predCreatedBy("base"), predPlanar()], [rankMaxZ()]),
        "surface:main",
        ["base"],
        { heal: false }
      ),
    ]),
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
    id: "replace-face",
    title: "Replace Face",
    part: part("example-replace-face", [
      extrude("base", profileRect(56, 32), 18, "body:base"),
      plane("replace-tool", 56, 32, "surface:tool", {
        origin: [0, 0, 18],
        deps: ["base"],
      }),
      replaceFace(
        "replace-top",
        selectorNamed("body:base"),
        selectorFace([predCreatedBy("base"), predPlanar()], [rankMaxZ()]),
        selectorNamed("surface:tool"),
        "body:main",
        ["base", "replace-tool"],
        { heal: true }
      ),
    ]),
    render: {
      layers: [
        {
          output: "body:main",
          color: [154, 192, 230],
          alpha: 1,
          wireframe: true,
          wireColor: [32, 40, 52],
          wireDepthTest: true,
          depthTest: true,
        },
        {
          output: "surface:tool",
          color: [230, 140, 70],
          alpha: 0.2,
          wireframe: false,
          depthTest: true,
        },
      ],
    },
  },
  {
    id: "move-face",
    title: "Move Face",
    part: part("example-move-face", [
      extrude("base", profileRect(56, 32), 18, "body:base"),
      moveFace(
        "move-top",
        selectorNamed("body:base"),
        selectorFace([predCreatedBy("base"), predPlanar()], [rankMaxZ()]),
        "surface:main",
        ["base"],
        {
          translation: [0, 0, 2],
          heal: false,
        }
      ),
    ]),
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
    id: "unwrap-box",
    title: "Unwrap (Box Net)",
    part: part("example-unwrap-box", [
      extrude("base", profileRect(48, 32), 20, "body:main"),
      unwrap("unwrap-1", selectorNamed("body:main"), "surface:flat", ["base"]),
    ]),
    render: {
      renderOpts: {
        backgroundAlpha: 0,
      },
      layers: [
        {
          output: "surface:flat",
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
