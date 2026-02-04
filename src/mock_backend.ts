import {
  Backend,
  ExecuteInput,
  KernelResult,
  KernelSelection,
  MeshData,
  MeshOptions,
  KernelObject,
} from "./backend.js";
import { IntentFeature, Sketch2D, Selector } from "./dsl.js";

let seq = 0;

export class MockBackend implements Backend {
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
      case "feature.revolve":
        return this.emitSolid(feature);
      case "feature.hole":
        return this.emitHole(feature, input.resolve, input.upstream);
      case "feature.fillet":
      case "feature.chamfer":
      case "feature.boolean":
      case "pattern.linear":
      case "pattern.circular":
        return this.emitGeneric(feature);
      default:
        return this.emitGeneric(feature);
    }
  }

  mesh(_target: KernelObject, _opts?: MeshOptions): MeshData {
    return { positions: [], indices: [] };
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
    const selections = [
      this.makeSelection("solid", { createdBy: feature.id, role: "body" }),
      this.makeSelection("face", {
        createdBy: feature.id,
        role: "top",
        planar: true,
        normal: "+Z",
        area: 100,
        centerZ: 6,
      }),
      this.makeSelection("face", {
        createdBy: feature.id,
        role: "bottom",
        planar: true,
        normal: "-Z",
        area: 100,
        centerZ: 0,
      }),
    ];

    const outputs = new Map([[resultName, this.makeObj("solid", solidId)]]);
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
    const selections = [
      this.makeSelection("face", {
        createdBy: feature.id,
        role: "hole",
        planar: false,
        normal: target.meta["normal"],
        area: 10,
        centerZ: target.meta["centerZ"],
      }),
    ];
    return { outputs: new Map(), selections };
  }

  private emitGeneric(feature: IntentFeature): KernelResult {
    return {
      outputs: new Map([[`feat:${feature.id}`, this.makeObj("unknown")]]),
      selections: [],
    };
  }

  private makeObj(
    kind: "solid" | "face" | "edge" | "datum" | "profile" | "unknown",
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
    seq += 1;
    return `${prefix}-${seq}`;
  }
}
