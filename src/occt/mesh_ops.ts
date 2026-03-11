import type { KernelObject, MeshData, MeshOptions } from "../backend.js";

type MeshDeps = {
  ensureTriangulation: (shape: any, opts: MeshOptions) => void;
  getTriangulation: (face: any) => { triangulation: any; loc: any };
  faceOrientationValue: (face: any) => number | null;
  callNumber: (target: any, method: string) => number;
  call: (target: any, method: string, ...args: any[]) => any;
  applyLocation: (pnt: any, loc: any) => any;
  pointToArray: (pnt: any) => [number, number, number];
  triangleNodes: (tri: any) => [number, number, number];
  computeNormals: (positions: number[], indices: number[]) => number[];
  buildEdgeLines: (
    shape: any,
    opts: MeshOptions
  ) => { positions: number[]; edgeIndices: number[] } | null;
};

export function mesh(params: {
  target: KernelObject;
  opts: MeshOptions;
  occt: any;
  deps: MeshDeps;
}): MeshData {
  const { target, opts, occt, deps } = params;
  const shape = target.meta["shape"] as any;
  if (!shape) {
    throw new Error("OCCT backend: mesh target missing shape metadata");
  }
  deps.ensureTriangulation(shape, opts);

  const explorer = new occt.TopExp_Explorer_1();
  explorer.Init(
    shape,
    occt.TopAbs_ShapeEnum.TopAbs_FACE,
    occt.TopAbs_ShapeEnum.TopAbs_SHAPE
  );

  const positions: number[] = [];
  const indices: number[] = [];
  const faceIds: number[] = [];
  let vertexOffset = 0;
  let faceIndex = 0;

  for (; explorer.More(); explorer.Next()) {
    const face = explorer.Current();
    const { triangulation, loc } = deps.getTriangulation(face);
    if (!triangulation) {
      faceIndex += 1;
      continue;
    }
    const orientation = deps.faceOrientationValue(face);
    const reversed =
      orientation !== null &&
      orientation === occt.TopAbs_Orientation?.TopAbs_REVERSED?.value;

    const nbNodes = deps.callNumber(triangulation, "NbNodes");
    for (let i = 1; i <= nbNodes; i += 1) {
      const pnt = deps.call(triangulation, "Node", i);
      const transformed = deps.applyLocation(pnt, loc);
      const coords = deps.pointToArray(transformed);
      positions.push(coords[0], coords[1], coords[2]);
    }

    const nbTriangles = deps.callNumber(triangulation, "NbTriangles");
    for (let i = 1; i <= nbTriangles; i += 1) {
      const tri = deps.call(triangulation, "Triangle", i);
      const [n1, n2, n3] = deps.triangleNodes(tri);
      if (reversed) {
        indices.push(vertexOffset + n1 - 1, vertexOffset + n3 - 1, vertexOffset + n2 - 1);
      } else {
        indices.push(vertexOffset + n1 - 1, vertexOffset + n2 - 1, vertexOffset + n3 - 1);
      }
      faceIds.push(faceIndex);
    }

    vertexOffset += nbNodes;
    faceIndex += 1;
  }

  const normals = deps.computeNormals(positions, indices);
  const edgeData = opts.includeEdges === false ? null : deps.buildEdgeLines(shape, opts);
  return {
    positions,
    indices,
    normals,
    faceIds,
    edgePositions: edgeData?.positions,
    edgeIndices: edgeData?.edgeIndices,
  };
}
