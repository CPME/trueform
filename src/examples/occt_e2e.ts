import initOpenCascade from "opencascade.js/dist/node.js";
import { dsl } from "../dsl.js";
import { OcctBackend } from "../backend_occt.js";
import { buildPart } from "../executor.js";

try {
  const occt = await initOpenCascade();
  const backend = new OcctBackend({ occt });

  const part = dsl.part("plate", [
    dsl.extrude("base-extrude", dsl.profileRect(80, 40), 8, "body:main"),
  ]);

  const result = buildPart(part, backend);
  const body = result.final.outputs.get("body:main");
  if (!body) {
    throw new Error("Missing body:main output");
  }

  const shape = body.meta["shape"] as any;
  const isNull = typeof shape.IsNull === "function" ? shape.IsNull() : false;
  const explorer = new (occt as any).TopExp_Explorer_1();
  explorer.Init(
    shape,
    (occt as any).TopAbs_ShapeEnum.TopAbs_FACE,
    (occt as any).TopAbs_ShapeEnum.TopAbs_SHAPE
  );
  let faceCount = 0;
  for (; explorer.More(); explorer.Next()) faceCount += 1;

  console.log(
    JSON.stringify(
      {
        partId: result.partId,
        featureOrder: result.order,
        isNull,
        faceCount,
      },
      null,
      2
    )
  );
} catch (err) {
  const error = err as Error;
  console.error("E2E failed:", error.message);
  if (error.stack) {
    console.error(error.stack.split("\n").slice(0, 6).join("\n"));
  }
  process.exit(1);
}
