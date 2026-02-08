import type { MeshData } from "../backend.js";
import type { Transform } from "../dsl.js";
import { normalizeTransform } from "../transform.js";

export type GlbMeshInput = {
  name?: string;
  mesh: MeshData;
  transform?: Transform;
};

export type GlbExportOptions = {
  unitScale?: number;
};

const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_VERSION = 2;
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"

export function exportGlb(
  meshesInput: GlbMeshInput[] | GlbMeshInput,
  opts: GlbExportOptions = {}
): Uint8Array {
  const meshes = Array.isArray(meshesInput) ? meshesInput : [meshesInput];
  if (meshes.length === 0) {
    throw new Error("GLB export: at least one mesh is required");
  }

  const unitScale = opts.unitScale ?? 1;
  const bufferViews: any[] = [];
  const accessors: any[] = [];
  const meshesOut: any[] = [];
  const nodes: any[] = [];
  const sceneNodes: number[] = [];

  const binChunks: Uint8Array[] = [];
  let binLength = 0;

  const pushChunk = (data: ArrayBufferView): { offset: number; length: number } => {
    const u8 =
      data instanceof Uint8Array
        ? data
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const offset = binLength;
    binChunks.push(u8);
    binLength += u8.byteLength;
    const pad = (4 - (binLength % 4)) % 4;
    if (pad) {
      binChunks.push(new Uint8Array(pad));
      binLength += pad;
    }
    return { offset, length: u8.byteLength };
  };

  const ensureIndices = (mesh: MeshData): number[] => {
    if (mesh.indices && mesh.indices.length > 0) return mesh.indices;
    const count = Math.floor(mesh.positions.length / 3);
    const indices = new Array(count);
    for (let i = 0; i < count; i += 1) indices[i] = i;
    return indices;
  };

  for (const entry of meshes) {
    const { mesh } = entry;
    if (!mesh.positions || mesh.positions.length === 0) {
      throw new Error("GLB export: mesh positions missing");
    }
    if (mesh.positions.length % 3 !== 0) {
      throw new Error("GLB export: positions length must be divisible by 3");
    }

    const positionArray = new Float32Array(mesh.positions.length);
    const positions = mesh.positions;
    for (let i = 0; i < positions.length; i += 1) {
      const value = positions[i] ?? 0;
      positionArray[i] = value * unitScale;
    }
    const positionInfo = pushChunk(positionArray);
    const positionView = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: positionInfo.offset,
      byteLength: positionInfo.length,
      target: 34962,
    });

    const { min, max } = minMax(positionArray);
    const positionAccessor = accessors.length;
    accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: positionArray.length / 3,
      type: "VEC3",
      min,
      max,
    });

    let normalAccessor: number | undefined;
    if (mesh.normals && mesh.normals.length === mesh.positions.length) {
      const normals = mesh.normals;
      const normalArray = new Float32Array(normals.length);
      for (let i = 0; i < normals.length; i += 1) {
        normalArray[i] = normals[i] ?? 0;
      }
      const normalInfo = pushChunk(normalArray);
      const normalView = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: normalInfo.offset,
        byteLength: normalInfo.length,
        target: 34962,
      });
      normalAccessor = accessors.length;
      accessors.push({
        bufferView: normalView,
        componentType: 5126,
        count: normalArray.length / 3,
        type: "VEC3",
      });
    }

    const indices = ensureIndices(mesh);
    if (indices.length % 3 !== 0) {
      throw new Error("GLB export: indices length must be divisible by 3");
    }
    const maxIndex = indices.reduce((maxVal, value) => (value > maxVal ? value : maxVal), 0);
    const indexComponentType = maxIndex > 65535 ? 5125 : 5123;
    const indexArray =
      indexComponentType === 5125
        ? Uint32Array.from(indices)
        : Uint16Array.from(indices);
    const indexInfo = pushChunk(indexArray);
    const indexView = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: indexInfo.offset,
      byteLength: indexInfo.length,
      target: 34963,
    });
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView,
      componentType: indexComponentType,
      count: indices.length,
      type: "SCALAR",
    });

    const meshIndex = meshesOut.length;
    meshesOut.push({
      name: entry.name,
      primitives: [
        {
          attributes: {
            POSITION: positionAccessor,
            ...(normalAccessor !== undefined ? { NORMAL: normalAccessor } : {}),
          },
          indices: indexAccessor,
        },
      ],
    });

    const node: Record<string, unknown> = { mesh: meshIndex };
    if (entry.name) node.name = entry.name;
    if (entry.transform) {
      const matrix = normalizeTransform(entry.transform);
      if (!isIdentityMatrix(matrix)) node.matrix = matrix;
    }
    const nodeIndex = nodes.length;
    nodes.push(node);
    sceneNodes.push(nodeIndex);
  }

  const gltf = {
    asset: {
      version: "2.0",
      generator: "trueform",
    },
    buffers: [{ byteLength: binLength }],
    bufferViews,
    accessors,
    meshes: meshesOut,
    nodes,
    scenes: [{ nodes: sceneNodes }],
    scene: 0,
  };

  const jsonText = JSON.stringify(gltf);
  const jsonBytes = new TextEncoder().encode(jsonText);
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonLength = jsonBytes.length + jsonPadding;
  const binPadding = (4 - (binLength % 4)) % 4;
  const totalLength = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES + jsonLength + GLB_CHUNK_HEADER_BYTES + binLength + binPadding;

  const out = new ArrayBuffer(totalLength);
  const view = new DataView(out);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);

  let offset = GLB_HEADER_BYTES;
  view.setUint32(offset, jsonLength, true);
  view.setUint32(offset + 4, GLB_CHUNK_JSON, true);
  offset += GLB_CHUNK_HEADER_BYTES;
  new Uint8Array(out, offset, jsonBytes.length).set(jsonBytes);
  if (jsonPadding) {
    new Uint8Array(out, offset + jsonBytes.length, jsonPadding).fill(0x20);
  }
  offset += jsonLength;

  view.setUint32(offset, binLength + binPadding, true);
  view.setUint32(offset + 4, GLB_CHUNK_BIN, true);
  offset += GLB_CHUNK_HEADER_BYTES;
  const binOut = new Uint8Array(out, offset, binLength + binPadding);
  let binOffset = 0;
  for (const chunk of binChunks) {
    binOut.set(chunk, binOffset);
    binOffset += chunk.byteLength;
  }

  return new Uint8Array(out);
}

function minMax(values: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i] ?? 0;
    const y = values[i + 1] ?? 0;
    const z = values[i + 2] ?? 0;
    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }
  return { min, max };
}

function isIdentityMatrix(matrix: number[]): boolean {
  return (
    matrix[0] === 1 && matrix[5] === 1 && matrix[10] === 1 && matrix[15] === 1 &&
    matrix[1] === 0 && matrix[2] === 0 && matrix[3] === 0 &&
    matrix[4] === 0 && matrix[6] === 0 && matrix[7] === 0 &&
    matrix[8] === 0 && matrix[9] === 0 && matrix[11] === 0 &&
    matrix[12] === 0 && matrix[13] === 0 && matrix[14] === 0
  );
}
