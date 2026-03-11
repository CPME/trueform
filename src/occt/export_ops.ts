import type { KernelObject, StepExportOptions, StlExportOptions } from "../backend.js";

type ExportDeps = {
  configureStepExport: (occt: any, opts: StepExportOptions) => void;
  newOcct: (name: string, ...args: any[]) => any;
  resolveStepModelType: (occt: any, kind: KernelObject["kind"]) => number;
  makeProgressRange: () => any;
  callWithFallback: (
    target: any,
    names: string[],
    argSets: any[][]
  ) => any;
  assertStepStatus: (occt: any, status: any, context: string) => void;
  makeStepPath: (fs: any) => string;
  makeStlPath: (fs: any) => string;
  ensureTriangulation: (
    shape: any,
    opts: {
      linearDeflection?: number;
      angularDeflection?: number;
      relative?: boolean;
      includeEdges?: boolean;
    }
  ) => void;
};

export function exportStep(params: {
  target: KernelObject;
  opts: StepExportOptions;
  occt: any;
  deps: ExportDeps;
}): Uint8Array {
  const { target, opts, occt, deps } = params;
  const shape = target.meta["shape"] as any;
  if (!shape) {
    throw new Error("OCCT backend: step export target missing shape metadata");
  }

  const fs = occt?.FS;
  if (!fs || typeof fs.readFile !== "function" || typeof fs.unlink !== "function") {
    throw new Error("OCCT backend: occt.FS not available for STEP export");
  }

  deps.configureStepExport(occt, opts);

  const writer = deps.newOcct("STEPControl_Writer");
  const modelType = deps.resolveStepModelType(occt, target.kind);
  const progress = deps.makeProgressRange();
  if (!progress) {
    throw new Error("OCCT backend: progress range unavailable for STEP export");
  }
  const transferStatus = deps.callWithFallback(
    writer,
    ["Transfer", "Transfer_1", "Transfer_2"],
    [
      [shape, modelType, true, progress],
      [shape, modelType, false, progress],
    ]
  );
  deps.assertStepStatus(occt, transferStatus, "STEP transfer");

  const tmpPath = deps.makeStepPath(fs);
  const writeStatus = deps.callWithFallback(
    writer,
    ["Write", "Write_1", "Write_2"],
    [[tmpPath, deps.makeProgressRange()], [tmpPath]]
  );
  deps.assertStepStatus(occt, writeStatus, "STEP write");

  return readAndCleanup(fs, tmpPath);
}

export function exportStl(params: {
  target: KernelObject;
  opts: StlExportOptions;
  occt: any;
  deps: ExportDeps;
}): Uint8Array {
  const { target, opts, occt, deps } = params;
  const shape = target.meta["shape"] as any;
  if (!shape) {
    throw new Error("OCCT backend: STL export target missing shape metadata");
  }

  const fs = occt?.FS;
  if (!fs || typeof fs.readFile !== "function" || typeof fs.unlink !== "function") {
    throw new Error("OCCT backend: occt.FS not available for STL export");
  }

  deps.ensureTriangulation(shape, {
    linearDeflection: opts.linearDeflection,
    angularDeflection: opts.angularDeflection,
    relative: opts.relative,
    includeEdges: false,
  });

  const writer = deps.newOcct("StlAPI_Writer");
  if (opts.format === "ascii") {
    try {
      deps.callWithFallback(writer, ["SetASCIIMode", "SetASCIIMode_1"], [[true], [1]]);
    } catch {
      // ignore if ASCII mode toggle is unavailable
    }
  } else if (opts.format === "binary") {
    try {
      deps.callWithFallback(writer, ["SetASCIIMode", "SetASCIIMode_1"], [[false], [0]]);
    } catch {
      // ignore if binary mode toggle is unavailable
    }
  }

  const tmpPath = deps.makeStlPath(fs);
  deps.callWithFallback(
    writer,
    ["Write", "Write_1", "Write_2"],
    [[shape, tmpPath, deps.makeProgressRange()], [shape, tmpPath]]
  );

  return readAndCleanup(fs, tmpPath);
}

function readAndCleanup(fs: any, path: string): Uint8Array {
  const data = fs.readFile(path);
  try {
    fs.unlink(path);
  } catch {
    // ignore cleanup errors
  }
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array(data);
}
