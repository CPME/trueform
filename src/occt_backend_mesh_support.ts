import {
  KernelObject,
  MeshData,
  MeshOptions,
  StepExportOptions,
} from "./backend.js";
import { OcctBackendShapeSupport } from "./occt_backend_shape_support.js";

type FaceSurfaceClass =
  | "plane"
  | "cylinder"
  | "cone"
  | "sphere"
  | "torus"
  | "bspline"
  | "bezier"
  | "extrusion"
  | "revolution"
  | "offset"
  | "other"
  | "unknown";

type FaceSurfaceMap = Map<number, Array<{ face: any; surface: FaceSurfaceClass }>>;

export abstract class OcctBackendMeshSupport extends OcctBackendShapeSupport {
  protected ensureTriangulation(shape: any, opts: MeshOptions) {
    const linear = opts.linearDeflection ?? 0.5;
    const angular = opts.angularDeflection ?? 0.5;
    const relative = opts.relative ?? false;
    const progress = this.makeProgressRange();
    const argsList: Array<unknown[]> = [
      [shape, linear, relative, angular, progress],
      [shape, linear, relative, angular, this.makeProgressRange()],
    ];
    for (const args of argsList) {
      try {
        this.newOcct("BRepMesh_IncrementalMesh_2", ...args);
        return;
      } catch {
        continue;
      }
    }
    throw new Error("OCCT backend: failed to triangulate shape");
  }

  protected makeProgressRange() {
    try {
      return this.newOcct("Message_ProgressRange_1");
    } catch {
      return null;
    }
  }

  protected configureStepExport(occt: any, opts: StepExportOptions): void {
    const setCVal = occt.Interface_Static_SetCVal ?? occt.Interface_Static?.SetCVal;
    const setIVal = occt.Interface_Static_SetIVal ?? occt.Interface_Static?.SetIVal;
    const setRVal = occt.Interface_Static_SetRVal ?? occt.Interface_Static?.SetRVal;
    if (opts.schema && typeof setCVal === "function") setCVal("write.step.schema", opts.schema);
    if (opts.unit && typeof setCVal === "function") setCVal("write.step.unit", this.stepUnitToken(opts.unit));
    if (typeof opts.precision === "number" && Number.isFinite(opts.precision)) {
      if (typeof setIVal === "function") setIVal("write.step.precision.mode", 1);
      if (typeof setRVal === "function") setRVal("write.step.precision.val", opts.precision);
    }
  }

  protected resolveStepModelType(occt: any, kind: KernelObject["kind"]): number {
    const types = occt?.STEPControl_StepModelType;
    if (!types) return 0;
    if (kind === "solid") {
      return types.STEPControl_ManifoldSolidBrep ?? types.STEPControl_AsIs ?? 0;
    }
    return types.STEPControl_AsIs ?? 0;
  }

  protected assertStepStatus(occt: any, status: unknown, label: string): void {
    if (typeof status === "boolean") {
      if (!status) throw new Error(`OCCT backend: ${label} failed`);
      return;
    }
    if (typeof status === "number") {
      const retDone = occt.IFSelect_ReturnStatus?.IFSelect_RetDone;
      if (typeof retDone === "number" && status !== retDone) {
        throw new Error(`OCCT backend: ${label} failed (status ${status})`);
      }
    }
  }

  protected callWithFallback(target: any, names: string[], argsList: unknown[][]): unknown {
    let sawFunction = false;
    let lastError: unknown = null;
    for (const name of names) {
      const fn = target?.[name];
      if (typeof fn !== "function") continue;
      sawFunction = true;
      for (const args of argsList) {
        try {
          return fn.call(target, ...args);
        } catch (err) {
          lastError = err;
        }
      }
    }
    if (sawFunction && lastError) {
      const msg = lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(`OCCT backend: ${names.join(" or ")} failed: ${msg}`);
    }
    throw new Error(`OCCT backend: missing ${names.join(" or ")}()`);
  }

  protected makeStepPath(fs: any): string {
    const dir = "/tmp";
    if (typeof fs?.mkdir === "function") {
      try {
        fs.mkdir(dir);
      } catch {}
    }
    const rand = Math.random().toString(36).slice(2);
    return `${dir}/trueform-${Date.now()}-${rand}.step`;
  }

  protected makeStlPath(fs: any): string {
    const dir = "/tmp";
    if (typeof fs?.mkdir === "function") {
      try {
        fs.mkdir(dir);
      } catch {}
    }
    const rand = Math.random().toString(36).slice(2);
    return `${dir}/trueform-${Date.now()}-${rand}.stl`;
  }

  protected stepUnitToken(unit: StepExportOptions["unit"]): string {
    switch (unit) {
      case "cm": return "CM";
      case "m": return "M";
      case "in": return "INCH";
      case "mm":
      default: return "MM";
    }
  }

  protected getTriangulation(face: any): { triangulation: any; loc: any } {
    const loc = this.newOcct("TopLoc_Location_1");
    const tool = this.occt.BRep_Tool;
    const topo = this.occt.TopoDS;
    if (!tool?.Triangulation) throw new Error("OCCT backend: BRep_Tool.Triangulation not available");
    if (!topo?.Face_1) throw new Error("OCCT backend: TopoDS.Face_1 not available");
    const triHandle = tool.Triangulation(topo.Face_1(face), loc, 0);
    if (triHandle?.IsNull && triHandle.IsNull()) return { triangulation: null, loc };
    return { triangulation: triHandle?.get ? triHandle.get() : triHandle, loc };
  }

  protected applyLocation(pnt: any, loc: any) {
    if (!loc || typeof loc.Transformation !== "function") return pnt;
    const trsf = loc.Transformation();
    if (!trsf || typeof pnt.Transformed !== "function") return pnt;
    return pnt.Transformed(trsf);
  }

  protected pointToArray(pnt: any): [number, number, number] {
    if (typeof pnt.X === "function") return [pnt.X(), pnt.Y(), pnt.Z()];
    if (typeof pnt.x === "function") return [pnt.x(), pnt.y(), pnt.z()];
    if (typeof pnt.Coord === "function") {
      const out = { value: [] as number[] };
      pnt.Coord(out);
      return [out.value[0] ?? 0, out.value[1] ?? 0, out.value[2] ?? 0];
    }
    throw new Error("OCCT backend: unsupported point type");
  }

  protected dirToArray(dir: any): [number, number, number] {
    if (typeof dir.X === "function") return [dir.X(), dir.Y(), dir.Z()];
    if (typeof dir.x === "function") return [dir.x(), dir.y(), dir.z()];
    if (typeof dir.Coord === "function") {
      const out = { value: [] as number[] };
      dir.Coord(out);
      return [out.value[0] ?? 0, out.value[1] ?? 0, out.value[2] ?? 0];
    }
    throw new Error("OCCT backend: unsupported direction type");
  }

  protected computeNormals(positions: number[], indices: number[]): number[] {
    if (positions.length === 0 || indices.length === 0) return [];
    const normals = new Array(positions.length).fill(0);
    for (let i = 0; i < indices.length; i += 3) {
      const ia = (indices[i] ?? 0) * 3;
      const ib = (indices[i + 1] ?? 0) * 3;
      const ic = (indices[i + 2] ?? 0) * 3;
      const ax = positions[ia] ?? 0;
      const ay = positions[ia + 1] ?? 0;
      const az = positions[ia + 2] ?? 0;
      const bx = positions[ib] ?? 0;
      const by = positions[ib + 1] ?? 0;
      const bz = positions[ib + 2] ?? 0;
      const cx = positions[ic] ?? 0;
      const cy = positions[ic + 1] ?? 0;
      const cz = positions[ic + 2] ?? 0;
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const nx = aby * acz - abz * acy;
      const ny = abz * acx - abx * acz;
      const nz = abx * acy - aby * acx;
      normals[ia] += nx; normals[ia + 1] += ny; normals[ia + 2] += nz;
      normals[ib] += nx; normals[ib + 1] += ny; normals[ib + 2] += nz;
      normals[ic] += nx; normals[ic + 1] += ny; normals[ic + 2] += nz;
    }
    for (let i = 0; i < normals.length; i += 3) {
      const nx = normals[i] ?? 0;
      const ny = normals[i + 1] ?? 0;
      const nz = normals[i + 2] ?? 0;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 1e-12) {
        normals[i] = nx / len;
        normals[i + 1] = ny / len;
        normals[i + 2] = nz / len;
      } else {
        normals[i] = 0; normals[i + 1] = 0; normals[i + 2] = 0;
      }
    }
    return normals;
  }

  protected triangleNodes(tri: any): [number, number, number] {
    if (typeof tri.Value === "function") return [tri.Value(1), tri.Value(2), tri.Value(3)];
    if (typeof tri.Get === "function") {
      const a = { value: 0 }, b = { value: 0 }, c = { value: 0 };
      tri.Get(a, b, c);
      return [a.value, b.value, c.value];
    }
    throw new Error("OCCT backend: unsupported triangle type");
  }

  protected faceOrientationValue(face: any): number | null {
    for (const name of ["Orientation", "Orientation_1", "Orientation_2", "Orientation_3"]) {
      const fn = face?.[name];
      if (typeof fn !== "function") continue;
      try {
        const value = fn.call(face);
        if (typeof value === "number") return value;
        if (value && typeof value.value === "number") return value.value;
      } catch {}
    }
    return null;
  }

  protected sewShapeFaces(shape: any, tolerance = 1e-6): any | null {
    let sewing: any;
    try {
      sewing = this.newOcct("BRepBuilderAPI_Sewing", tolerance, true, true, true, false);
    } catch {
      return null;
    }
    const add = typeof sewing.Add_1 === "function" ? sewing.Add_1.bind(sewing) :
      typeof sewing.Add === "function" ? sewing.Add.bind(sewing) : null;
    if (!add) return null;
    const explorer = new this.occt.TopExp_Explorer_1();
    explorer.Init(shape, this.occt.TopAbs_ShapeEnum.TopAbs_FACE, this.occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    let sawFace = false;
    for (; explorer.More(); explorer.Next()) {
      sawFace = true;
      add(explorer.Current());
    }
    if (!sawFace) return null;
    const progress = this.makeProgressRange();
    try {
      sewing.Perform(progress);
    } catch {
      try { sewing.Perform(); } catch { return null; }
    }
    try {
      return this.callWithFallback(sewing, ["SewedShape", "SewedShape_1"], [[]]);
    } catch {
      return null;
    }
  }

  protected edgeContinuityValue(edge: any, faceA: any, faceB: any): number | null {
    const tool = this.occt.BRep_Tool;
    if (!tool) return null;
    const edgeHandle = this.toEdge(edge);
    const face1 = this.toFace(faceA);
    const face2 = this.toFace(faceB);
    for (const name of ["Continuity_1", "Continuity"]) {
      const fn = tool?.[name];
      if (typeof fn !== "function") continue;
      try {
        const value = fn.call(tool, edgeHandle, face1, face2);
        if (typeof value === "number") return value;
        if (value && typeof value.value === "number") return value.value;
      } catch {}
    }
    return null;
  }

  protected shapeHash(shape: any, upper = 2147483647): number {
    if (shape && typeof shape.HashCode === "function") {
      try {
        const value = shape.HashCode(upper);
        if (typeof value === "number") return value;
      } catch {}
    }
    return 0;
  }

  protected shapesSame(a: any, b: any): boolean {
    if (a === b) return true;
    if (a && typeof a.IsSame === "function") {
      try { return !!a.IsSame(b); } catch {}
    }
    if (a && typeof a.IsEqual === "function") {
      try { return !!a.IsEqual(b); } catch {}
    }
    return false;
  }

  protected call(target: any, name: string, ...args: unknown[]) {
    const fn = target?.[name];
    if (typeof fn !== "function") throw new Error(`OCCT backend: missing ${name}()`);
    return fn.call(target, ...args);
  }

  protected callNumber(target: any, name: string): number {
    const value = this.call(target, name);
    if (typeof value !== "number") throw new Error(`OCCT backend: ${name}() did not return number`);
    return value;
  }

  protected buildEdgeAdjacency(shape: any): Map<number, Array<{ edge: any; faces: any[] }>> | null {
    if (!this.occt.TopExp_Explorer_1) return null;
    const adjacency = new Map<number, Array<{ edge: any; faces: any[] }>>();
    const faceExplorer = new this.occt.TopExp_Explorer_1();
    faceExplorer.Init(shape, this.occt.TopAbs_ShapeEnum.TopAbs_FACE, this.occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; faceExplorer.More(); faceExplorer.Next()) {
      const face = faceExplorer.Current();
      const faceHandle = this.toFace(face);
      const edgeExplorer = new this.occt.TopExp_Explorer_1();
      edgeExplorer.Init(face, this.occt.TopAbs_ShapeEnum.TopAbs_EDGE, this.occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
      for (; edgeExplorer.More(); edgeExplorer.Next()) {
        const edge = this.toEdge(edgeExplorer.Current());
        const hash = this.shapeHash(edge);
        const bucket = adjacency.get(hash) ?? [];
        let entry = bucket.find((item) => this.shapesSame(item.edge, edge));
        if (!entry) {
          entry = { edge, faces: [] };
          bucket.push(entry);
        }
        if (!entry.faces.some((f) => this.shapesSame(f, faceHandle))) entry.faces.push(faceHandle);
        if (!adjacency.has(hash)) adjacency.set(hash, bucket);
      }
    }
    return adjacency;
  }

  protected adjacentFaces(adjacency: Map<number, Array<{ edge: any; faces: any[] }>> | null, edge: any): any[] {
    if (!adjacency) return [];
    const hash = this.shapeHash(edge);
    const bucket = adjacency.get(hash);
    if (!bucket) return [];
    for (const entry of bucket) {
      if (this.shapesSame(entry.edge, edge)) return entry.faces;
    }
    return [];
  }

  protected buildFaceSurfaceMap(shape: any): FaceSurfaceMap | null {
    if (!this.occt.TopExp_Explorer_1) return null;
    const surfaces: FaceSurfaceMap = new Map();
    const explorer = new this.occt.TopExp_Explorer_1();
    explorer.Init(shape, this.occt.TopAbs_ShapeEnum.TopAbs_FACE, this.occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    for (; explorer.More(); explorer.Next()) {
      const face = this.toFace(explorer.Current());
      const hash = this.shapeHash(face);
      const bucket = surfaces.get(hash) ?? [];
      if (!bucket.some((entry) => this.shapesSame(entry.face, face))) {
        bucket.push({ face, surface: this.faceSurfaceClass(face) });
      }
      if (!surfaces.has(hash)) surfaces.set(hash, bucket);
    }
    return surfaces;
  }

  protected faceSurfaceClass(face: any): FaceSurfaceClass {
    try {
      const adaptor = this.newOcct("BRepAdaptor_Surface", this.toFace(face), true);
      const type = this.call(adaptor, "GetType") as { value?: number } | undefined;
      const types = this.occt.GeomAbs_SurfaceType;
      if (!types || typeof type?.value !== "number") return "unknown";
      const value = type.value;
      const matches = (entry: { value?: number } | undefined) =>
        typeof entry?.value === "number" && entry.value === value;
      if (matches(types.GeomAbs_Plane)) return "plane";
      if (matches(types.GeomAbs_Cylinder)) return "cylinder";
      if (matches(types.GeomAbs_Cone)) return "cone";
      if (matches(types.GeomAbs_Sphere)) return "sphere";
      if (matches(types.GeomAbs_Torus)) return "torus";
      if (matches(types.GeomAbs_BSplineSurface)) return "bspline";
      if (matches(types.GeomAbs_BezierSurface)) return "bezier";
      if (matches(types.GeomAbs_SurfaceOfExtrusion)) return "extrusion";
      if (matches(types.GeomAbs_SurfaceOfRevolution)) return "revolution";
      if (matches(types.GeomAbs_OffsetSurface)) return "offset";
      return "other";
    } catch {
      return "unknown";
    }
  }

  protected surfaceClassForFace(surfaces: FaceSurfaceMap | null, face: any): FaceSurfaceClass | null {
    if (!surfaces) return null;
    const hash = this.shapeHash(face);
    const bucket = surfaces.get(hash);
    if (!bucket) return null;
    for (const entry of bucket) {
      if (this.shapesSame(entry.face, face)) return entry.surface;
    }
    return null;
  }

  protected includeSmoothFeatureEdge(faces: any[], surfaces: FaceSurfaceMap | null): boolean {
    if (faces.length !== 2) return false;
    const a = this.surfaceClassForFace(surfaces, faces[0]);
    const b = this.surfaceClassForFace(surfaces, faces[1]);
    if (!a || !b || a === "unknown" || b === "unknown") return false;
    return a !== b;
  }

  protected buildEdgeLines(shape: any, opts: MeshOptions): { positions: number[]; edgeIndices: number[] } {
    const includeAllTangentEdges = opts.includeTangentEdges === true;
    const hideAllTangentEdges = opts.hideTangentEdges === true && !includeAllTangentEdges;
    const adjacency = this.buildEdgeAdjacency(shape);
    const surfaces = includeAllTangentEdges || hideAllTangentEdges ? null : this.buildFaceSurfaceMap(shape);
    const explorer = new this.occt.TopExp_Explorer_1();
    explorer.Init(shape, this.occt.TopAbs_ShapeEnum.TopAbs_EDGE, this.occt.TopAbs_ShapeEnum.TopAbs_SHAPE);
    const positions: number[] = [];
    const edgeIndices: number[] = [];
    let edgeIndex = 0;
    for (; explorer.More(); explorer.Next()) {
      const edge = this.toEdge(explorer.Current());
      const faces = this.adjacentFaces(adjacency, edge);
      if (faces.length > 0 && faces.length < 2) {
        edgeIndex += 1;
        continue;
      }
      if (faces.length >= 2) {
        const continuity = this.edgeContinuityValue(edge, faces[0], faces[1]);
        if (!includeAllTangentEdges && continuity !== null && continuity > 0) {
          if (hideAllTangentEdges || !this.includeSmoothFeatureEdge(faces, surfaces)) {
            edgeIndex += 1;
            continue;
          }
        }
      }
      const points = this.sampleEdgePoints(edge, opts);
      if (points.length < 2) {
        edgeIndex += 1;
        continue;
      }
      for (let i = 0; i + 1 < points.length; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (!a || !b) continue;
        positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
        edgeIndices.push(edgeIndex);
      }
      edgeIndex += 1;
    }
    return { positions, edgeIndices };
  }

  protected sampleEdgePoints(edge: any, opts: MeshOptions): Array<[number, number, number]> {
    try {
      const adaptor = this.newOcct("BRepAdaptor_Curve", edge);
      const first = this.callNumber(adaptor, "FirstParameter");
      const last = this.callNumber(adaptor, "LastParameter");
      if (!Number.isFinite(first) || !Number.isFinite(last)) return [];
      const bounds = this.shapeBounds(edge);
      const dx = bounds.max[0] - bounds.min[0];
      const dy = bounds.max[1] - bounds.min[1];
      const dz = bounds.max[2] - bounds.min[2];
      const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const step = opts.edgeSegmentLength && opts.edgeSegmentLength > 0 ? opts.edgeSegmentLength : 1;
      const maxSegments = Math.max(1, opts.edgeMaxSegments ?? 64);
      const span = Math.abs(last - first);
      const byDiag = Math.ceil((diag || step) / step);
      const bySpan = Math.ceil(span || 1);
      const segments = Math.min(maxSegments, Math.max(1, byDiag, bySpan));
      const points: Array<[number, number, number]> = [];
      for (let i = 0; i <= segments; i += 1) {
        const u = first + (last - first) * (i / segments);
        points.push(this.pointToArray(this.call(adaptor, "Value", u)));
      }
      return points;
    } catch {
      return [];
    }
  }
}
