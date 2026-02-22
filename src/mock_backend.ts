import {
  Backend,
  BackendCapabilities,
  ExecuteInput,
  KernelResult,
  KernelSelection,
  MeshData,
  MeshOptions,
  KernelObject,
} from "./backend.js";
import { IntentFeature, Sketch2D, Selector } from "./ir.js";
import { TF_STAGED_FEATURES } from "./feature_staging.js";

export class MockBackend implements Backend {
  private seq = 0;

  capabilities(): BackendCapabilities {
    return {
      name: "mock",
      featureKinds: [
        "datum.plane",
        "datum.axis",
        "datum.frame",
        "feature.sketch2d",
        "feature.extrude",
        "feature.plane",
        "feature.surface",
        "feature.revolve",
        "feature.pipeSweep",
        "feature.hexTubeSweep",
        "feature.loft",
        "feature.sweep",
        "feature.shell",
        "feature.pipe",
        "feature.mirror",
        "feature.delete.face",
        "feature.replace.face",
        "feature.move.body",
        "feature.draft",
        "feature.thicken",
        "feature.thread",
        "feature.hole",
        "feature.fillet",
        "feature.chamfer",
        "feature.boolean",
        "pattern.linear",
        "pattern.circular",
      ],
      featureStages: TF_STAGED_FEATURES,
      mesh: true,
      exports: { step: true, stl: true },
      assertions: ["assert.brepValid", "assert.minEdgeLength"],
    };
  }

  reset(): void {
    this.seq = 0;
  }

  execute(input: ExecuteInput): KernelResult {
    const feature = input.feature;
    switch (feature.kind) {
      case "datum.plane":
      case "datum.axis":
      case "datum.frame":
        return this.emitDatum(feature);
      case "feature.sketch2d":
        return this.emitSketch(feature as Sketch2D);
      case "feature.extrude":
        if ((feature as { mode?: string }).mode === "surface") {
          return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      case "feature.plane":
        return this.emitSurface(feature, "face");
      case "feature.surface":
        return this.emitSurface(feature, "face");
      case "feature.revolve":
        if ((feature as { mode?: string }).mode === "surface") {
          return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      case "feature.pipeSweep":
      case "feature.hexTubeSweep":
        if ((feature as { mode?: string }).mode === "surface") {
          return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      case "feature.loft":
        if ((feature as { mode?: string }).mode === "surface") {
          return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      case "feature.sweep":
        if ((feature as { mode?: string }).mode === "surface") {
          return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      case "feature.mirror": {
        const source = (feature as { source?: Selector }).source;
        if (source) {
          const target = input.resolve(source, input.upstream);
          if (target.kind === "face") return this.emitSurface(feature, "face");
          if (target.kind === "surface") return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      }
      case "feature.move.body": {
        const source = (feature as { source?: Selector }).source;
        if (source) {
          const target = input.resolve(source, input.upstream);
          if (target.kind === "face") return this.emitSurface(feature, "face");
          if (target.kind === "surface") return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      }
      case "feature.delete.face": {
        const source = (feature as { source?: Selector }).source;
        if (source) {
          const target = input.resolve(source, input.upstream);
          if (target.kind === "solid") return this.emitSurface(feature, "surface");
          if (target.kind === "face") return this.emitSurface(feature, "face");
          if (target.kind === "surface") return this.emitSurface(feature, "surface");
        }
        return this.emitSurface(feature, "surface");
      }
      case "feature.replace.face": {
        const source = (feature as { source?: Selector }).source;
        if (source) {
          const target = input.resolve(source, input.upstream);
          if (target.kind === "solid") return this.emitSolid(feature);
          if (target.kind === "face") return this.emitSurface(feature, "face");
          if (target.kind === "surface") return this.emitSurface(feature, "surface");
        }
        return this.emitSolid(feature);
      }
      case "feature.shell":
      case "feature.draft":
      case "feature.thicken":
      case "feature.thread":
        return this.emitSolid(feature);
      case "feature.hole":
        return this.emitHole(feature, input.resolve, input.upstream);
      case "feature.fillet":
      case "feature.chamfer":
      case "feature.boolean":
      case "pattern.linear":
      case "pattern.circular":
        return this.emitPatternOrGeneric(feature);
      default:
        return this.emitPatternOrGeneric(feature);
    }
  }

  mesh(_target: KernelObject, _opts?: MeshOptions): MeshData {
    return { positions: [], indices: [] };
  }

  exportStep(_target: KernelObject): Uint8Array {
    return new Uint8Array();
  }

  exportStl(_target: KernelObject): Uint8Array {
    return new Uint8Array();
  }

  checkValid(_target: KernelObject): boolean {
    return true;
  }

  private emitDatum(feature: IntentFeature): KernelResult {
    return {
      outputs: new Map([[`datum:${feature.id}`, this.makeObj("datum")]]),
      selections: [],
    };
  }

  private emitSolid(feature: IntentFeature): KernelResult {
    const solidId = this.nextId("solid");
    const resultName =
      "result" in feature && typeof (feature as { result?: string }).result === "string"
        ? (feature as { result: string }).result
        : `body:${feature.id}`;
    const ownerKey = resultName;
    const selections = [
      this.makeSelection("solid", {
        createdBy: feature.id,
        role: "body",
        ownerKey,
        center: [0, 0, 3],
      }),
      this.makeSelection("face", {
        createdBy: feature.id,
        role: "top",
        planar: true,
        normal: "+Z",
        area: 100,
        centerZ: 6,
        center: [0, 0, 6],
        ownerKey,
      }),
      this.makeSelection("face", {
        createdBy: feature.id,
        role: "bottom",
        planar: true,
        normal: "-Z",
        area: 100,
        centerZ: 0,
        center: [0, 0, 0],
        ownerKey,
      }),
    ];

    const outputs = new Map([[resultName, this.makeObj("solid", solidId)]]);
    return { outputs, selections };
  }

  private emitSurface(
    feature: IntentFeature,
    outputKind: "face" | "surface"
  ): KernelResult {
    const resultName =
      "result" in feature && typeof (feature as { result?: string }).result === "string"
        ? (feature as { result: string }).result
        : `surface:${feature.id}`;
    const ownerKey = resultName;
    const selections = [
      this.makeSelection("face", {
        createdBy: feature.id,
        role: "surface",
        planar: true,
        normal: "+Z",
        area: 50,
        centerZ: 0,
        center: [0, 0, 0],
        ownerKey,
      }),
    ];
    const outputs = new Map([[resultName, this.makeObj(outputKind)]]);
    return { outputs, selections };
  }

  private emitSketch(feature: Sketch2D): KernelResult {
    const outputs = new Map<string, ReturnType<MockBackend["makeObj"]>>();
    for (const entry of feature.profiles) {
      outputs.set(
        entry.name,
        this.makeObj("profile", this.nextId("profile"), { profile: entry.profile })
      );
    }
    return { outputs, selections: [] };
  }

  private emitHole(
    feature: IntentFeature,
    resolve: (s: Selector, r: KernelResult) => KernelSelection,
    upstream: KernelResult
  ): KernelResult {
    const target = resolve((feature as { onFace: Selector }).onFace, upstream);
    const ownerKey =
      typeof target.meta["ownerKey"] === "string" ? (target.meta["ownerKey"] as string) : undefined;
    const center =
      Array.isArray(target.meta["center"]) && target.meta["center"]?.length === 3
        ? (target.meta["center"] as [number, number, number])
        : [0, 0, 0];
    const selections = [
      this.makeSelection("face", {
        createdBy: feature.id,
        role: "hole",
        planar: false,
        normal: target.meta["normal"],
        area: 10,
        centerZ: target.meta["centerZ"],
        center,
        ownerKey,
      }),
    ];
    return { outputs: new Map(), selections };
  }

  private emitPatternOrGeneric(feature: IntentFeature): KernelResult {
    if (feature.kind === "pattern.linear" || feature.kind === "pattern.circular") {
      const source =
        "source" in feature ? (feature as { source?: Selector }).source : undefined;
      if (source) {
        const resultName =
          "result" in feature && typeof (feature as { result?: string }).result === "string"
            ? (feature as { result: string }).result
            : `body:${feature.id}`;
        return {
          outputs: new Map([[resultName, this.makeObj("solid")]]),
          selections: [
            this.makeSelection("solid", {
              createdBy: feature.id,
              role: "body",
              ownerKey: resultName,
              center: [0, 0, 0],
            }),
          ],
        };
      }
      return {
        outputs: new Map([[`pattern:${feature.id}`, this.makeObj("pattern")]]),
        selections: [],
      };
    }
    return {
      outputs: new Map([[`feat:${feature.id}`, this.makeObj("unknown")]]),
      selections: [],
    };
  }

  private makeObj(
    kind:
      | "solid"
      | "surface"
      | "face"
      | "edge"
      | "datum"
      | "pattern"
      | "profile"
      | "unknown",
    id?: string,
    meta: Record<string, unknown> = {}
  ) {
    return {
      id: id ?? this.nextId(kind),
      kind,
      meta,
    };
  }

  private makeSelection(kind: "face" | "edge" | "solid", meta: Record<string, unknown>) {
    return {
      id: this.nextId(kind),
      kind,
      meta,
    };
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.seq}`;
  }
}
