type EdgeSegment = {
  start: [number, number, number];
  end: [number, number, number];
  closed?: boolean;
};

export function makeFaceFromWire(params: {
  wire: any;
  newOcct: (name: string, ...args: any[]) => any;
}): any {
  const { wire, newOcct } = params;
  try {
    return newOcct("BRepBuilderAPI_MakeFace", wire, true);
  } catch {
    return newOcct("BRepBuilderAPI_MakeFace", wire);
  }
}

export function readFace(params: { builder: any; readShape: (builder: any) => any }): any {
  const { builder, readShape } = params;
  if (builder.Face) return builder.Face();
  if (builder.face) return builder.face();
  return readShape(builder);
}

export function addWireEdge(params: { builder: any; edge: any }): boolean {
  const { builder, edge } = params;
  const candidates = ["Add", "Add_1", "Add_2", "add"];
  for (const name of candidates) {
    const fn = builder?.[name];
    if (typeof fn !== "function") continue;
    try {
      fn.call(builder, edge);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export function checkLoopContinuity(
  segments: EdgeSegment[],
  allowOpen: boolean,
  deps: { pointsClose: (a: [number, number, number], b: [number, number, number], tol?: number) => boolean }
): boolean {
  if (segments.length === 0) {
    throw new Error("OCCT backend: sketch loop must have at least one segment");
  }
  if (segments.length === 1 && segments[0]?.closed) {
    return true;
  }
  if (segments.some((segment) => segment.closed)) {
    throw new Error("OCCT backend: closed sketch segment must be alone in loop");
  }
  for (let i = 0; i < segments.length - 1; i += 1) {
    const current = segments[i];
    const next = segments[i + 1];
    if (!current || !next) continue;
    if (!deps.pointsClose(current.end, next.start)) {
      throw new Error("OCCT backend: sketch loop is not contiguous");
    }
  }
  const first = segments[0];
  const last = segments[segments.length - 1];
  const closed = !!first && !!last && deps.pointsClose(last.end, first.start);
  if (!allowOpen && !closed) {
    throw new Error("OCCT backend: sketch loop is not closed");
  }
  return closed;
}

export function pointsClose(
  a: [number, number, number],
  b: [number, number, number],
  tol = 1e-6
): boolean {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol;
}
