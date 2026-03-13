import assert from "node:assert/strict";
import { OcctBackendShapeSupport } from "../occt_backend_shape_support.js";
import { runTests } from "./occt_test_utils.js";

class TestShapeSupport extends OcctBackendShapeSupport {
  protected occt: any = {};

  public ctorCalls: Array<{ name: string; args: unknown[] }> = [];

  protected metadataContext(): any {
    throw new Error("unused");
  }

  protected shapeAnalysisDeps(): any {
    throw new Error("unused");
  }

  protected shapeMutationPrimitiveDeps(): any {
    throw new Error("unused");
  }

  protected builderPrimitiveDeps(): any {
    throw new Error("unused");
  }

  protected sampleEdgePoints(): Array<[number, number, number]> {
    throw new Error("unused");
  }

  protected makeProgressRange(): any {
    return null;
  }

  protected callWithFallback(target: any, names: string[], _argsList: unknown[][]): unknown {
    if (names.includes("Build")) {
      target.buildCalls = (target.buildCalls ?? 0) + 1;
      return undefined;
    }
    if (names.includes("Shape")) {
      return target.shape;
    }
    throw new Error(`unexpected fallback call ${names.join(",")}`);
  }

  protected newOcct(name: string, ...args: unknown[]): any {
    this.ctorCalls.push({ name, args });
    if (name === "ShapeUpgrade_UnifySameDomain" && args.length === 4) {
      throw new Error("four-arg ctor unavailable");
    }
    if (name === "ShapeUpgrade_UnifySameDomain" && args.length === 3) {
      throw new Error("three-arg ctor unavailable");
    }
    return { shape: { unified: true, args }, args };
  }

  protected makePnt(): any {
    throw new Error("unused");
  }

  protected makeDir(): any {
    throw new Error("unused");
  }

  protected makeAx2(): any {
    throw new Error("unused");
  }

  protected makeWireFromEdges(): any {
    throw new Error("unused");
  }

  protected makeLineEdge(): any {
    throw new Error("unused");
  }

  protected makeFaceFromWire(): any {
    throw new Error("unused");
  }

  protected readFace(): any {
    throw new Error("unused");
  }
}

const tests = [
  {
    name: "backend shape support: unifySameDomain tries legacy constructor fallbacks",
    fn: async () => {
      const support = new TestShapeSupport();
      const inputShape = { id: "seed" };

      const unified = (support as any).unifySameDomain(inputShape);

      assert.deepEqual(unified, {
        unified: true,
        args: [inputShape],
      });
      assert.deepEqual(
        support.ctorCalls.map((entry) => `${entry.name}:${entry.args.length}`),
        [
          "ShapeUpgrade_UnifySameDomain:4",
          "ShapeUpgrade_UnifySameDomain:4",
          "ShapeUpgrade_UnifySameDomain:3",
          "ShapeUpgrade_UnifySameDomain:1",
        ]
      );
    },
  },
  {
    name: "backend shape support: reverseShape prefers Reversed helpers before in-place Reverse",
    fn: async () => {
      const support = new TestShapeSupport();
      const reversed = { kind: "reversed" };
      const shape = {
        Reversed_2() {
          return reversed;
        },
        Reverse() {
          throw new Error("should not call in-place reverse when Reversed_* works");
        },
      };

      const next = (support as any).reverseShape(shape);
      assert.equal(next, reversed);
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
