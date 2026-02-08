import assert from "node:assert/strict";
import { dsl } from "../dsl.js";
import { normalizePart } from "../compiler.js";
import { runTests } from "./occt_test_utils.js";

const tests = [
  {
    name: "params: normalize units and expressions",
    fn: async () => {
      const part = dsl.part(
        "plate",
        [
          dsl.extrude(
            "base",
            dsl.profileRect(
              dsl.exprLiteral(10, "cm"),
              dsl.exprLiteral(2, "in")
            ),
            dsl.exprAdd(dsl.exprParam("thickness"), dsl.exprLiteral(5, "mm")),
            "body:main"
          ),
          dsl.revolve(
            "ring",
            dsl.profileCircle(dsl.exprLiteral(5, "mm")),
            "+Z",
            dsl.exprLiteral(180, "deg"),
            "body:main"
          ),
        ],
        {
          params: [dsl.paramLength("thickness", dsl.exprLiteral(5, "mm"))],
        }
      );

      const normalized = normalizePart(part);
      const base = normalized.features[0] as ReturnType<typeof dsl.extrude>;
      const ring = normalized.features[1] as ReturnType<typeof dsl.revolve>;

      const profile = base.profile;
      assert.equal(profile.kind, "profile.rectangle");
      if (profile.kind !== "profile.rectangle") {
        throw new Error("Expected rectangle profile");
      }
      const width = profile.width as number;
      const height = profile.height as number;
      assert.equal(width, 100); // 10 cm -> 100 mm
      assert.ok(Math.abs(height - 50.8) < 1e-9); // 2 in -> 50.8 mm

      assert.equal(base.depth, 10); // 5mm + 5mm
      assert.equal(typeof ring.angle, "number");
      assert.ok(Math.abs((ring.angle as number) - Math.PI) < 1e-9);
    },
  },
  {
    name: "params: unitless values respect document units",
    fn: async () => {
      const part = dsl.part("plate", [
        dsl.extrude("base", dsl.profileRect(2, 3), 10, "body:main"),
      ]);
      const normalized = normalizePart(part, undefined, undefined, "cm");
      const base = normalized.features[0] as ReturnType<typeof dsl.extrude>;
      const profile = base.profile;
      assert.equal(profile.kind, "profile.rectangle");
      if (profile.kind !== "profile.rectangle") {
        throw new Error("Expected rectangle profile");
      }
      assert.equal(profile.width as number, 20);
      assert.equal(profile.height as number, 30);
      assert.equal(base.depth, 100);
    },
  },
  {
    name: "params: override values",
    fn: async () => {
      const part = dsl.part(
        "plate",
        [
          dsl.extrude(
            "base",
            dsl.profileRect(dsl.exprParam("width"), dsl.exprLiteral(20, "mm")),
            dsl.exprLiteral(5, "mm"),
            "body:main"
          ),
        ],
        {
          params: [dsl.paramLength("width", dsl.exprLiteral(10, "mm"))],
        }
      );

      const normalized = normalizePart(part, {
        width: dsl.exprLiteral(25, "mm"),
      });
      const base = normalized.features[0] as ReturnType<typeof dsl.extrude>;
      const profile = base.profile;
      assert.equal(profile.kind, "profile.rectangle");
      if (profile.kind !== "profile.rectangle") {
        throw new Error("Expected rectangle profile");
      }
      assert.equal(profile.width as number, 25);
    },
  },
  {
    name: "params: type mismatch errors",
    fn: async () => {
      const part = dsl.part(
        "plate",
        [
          dsl.extrude(
            "base",
            dsl.profileRect(dsl.exprLiteral(10, "mm"), dsl.exprLiteral(20, "mm")),
            dsl.exprParam("angle"),
            "body:main"
          ),
        ],
        {
          params: [dsl.paramAngle("angle", dsl.exprLiteral(45, "deg"))],
        }
      );
      assert.throws(() => normalizePart(part), /Expected length/);
    },
  },
  {
    name: "params: unknown param errors",
    fn: async () => {
      const part = dsl.part("plate", [
        dsl.extrude(
          "base",
          dsl.profileRect(dsl.exprLiteral(10, "mm"), dsl.exprLiteral(20, "mm")),
          dsl.exprParam("missing"),
          "body:main"
        ),
      ]);
      assert.throws(() => normalizePart(part), /Unknown param/);
    },
  },
  {
    name: "params: division by zero errors",
    fn: async () => {
      const part = dsl.part("plate", [
        dsl.extrude(
          "base",
          dsl.profileRect(dsl.exprLiteral(10, "mm"), dsl.exprLiteral(20, "mm")),
          dsl.exprDiv(dsl.exprLiteral(1, "mm"), dsl.exprLiteral(0)),
          "body:main"
        ),
      ]);
      assert.throws(() => normalizePart(part), /Division by zero/);
    },
  },
  {
    name: "params: invalid override errors",
    fn: async () => {
      const part = dsl.part(
        "plate",
        [
          dsl.extrude(
            "base",
            dsl.profileRect(dsl.exprLiteral(10, "mm"), dsl.exprLiteral(20, "mm")),
            dsl.exprLiteral(5, "mm"),
            "body:main"
          ),
        ],
        {
          params: [dsl.paramLength("depth", dsl.exprLiteral(5, "mm"))],
        }
      );
      assert.throws(
        () => normalizePart(part, { missing: dsl.exprLiteral(1, "mm") }),
        /Unknown param override/
      );
    },
  },
];

runTests(tests).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
