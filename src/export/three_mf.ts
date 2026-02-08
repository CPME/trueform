import { strToU8, zipSync } from "fflate";
import type { MeshData } from "../backend.js";

export type ThreeMfUnit = "mm" | "cm" | "m" | "in";

export type ThreeMfExportOptions = {
  unit?: ThreeMfUnit;
  name?: string;
};

export function export3mf(mesh: MeshData, opts: ThreeMfExportOptions = {}): Uint8Array {
  if (!mesh.positions || mesh.positions.length === 0) {
    throw new Error("3MF export: mesh positions missing");
  }
  if (mesh.positions.length % 3 !== 0) {
    throw new Error("3MF export: positions length must be divisible by 3");
  }
  const indices = mesh.indices ?? buildSequentialIndices(mesh.positions.length / 3);
  if (indices.length % 3 !== 0) {
    throw new Error("3MF export: indices length must be divisible by 3");
  }

  const unitToken = threeMfUnitToken(opts.unit ?? "mm");
  const modelXml = buildModelXml(mesh, indices, unitToken, opts.name ?? "trueform-part");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypesXml()),
    "_rels/.rels": strToU8(relationshipsXml()),
    "3D/3dmodel.model": strToU8(modelXml),
  };

  return zipSync(files, { level: 0 });
}

function buildSequentialIndices(vertexCount: number): number[] {
  const indices = new Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) indices[i] = i;
  return indices;
}

function threeMfUnitToken(unit: ThreeMfUnit): string {
  switch (unit) {
    case "mm":
      return "millimeter";
    case "cm":
      return "centimeter";
    case "m":
      return "meter";
    case "in":
      return "inch";
    default:
      return "millimeter";
  }
}

function contentTypesXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
    '</Types>',
  ].join("\n");
}

function relationshipsXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/>',
    '</Relationships>',
  ].join("\n");
}

function buildModelXml(mesh: MeshData, indices: number[], unit: string, name: string): string {
  const vertices: string[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i] ?? 0;
    const y = mesh.positions[i + 1] ?? 0;
    const z = mesh.positions[i + 2] ?? 0;
    vertices.push(`    <vertex x="${formatNum(x)}" y="${formatNum(y)}" z="${formatNum(z)}"/>`);
  }

  const triangles: string[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    triangles.push(
      `    <triangle v1="${indices[i]}" v2="${indices[i + 1]}" v3="${indices[i + 2]}"/>`
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" unit="${unit}" xml:lang="en-US">`,
    "  <resources>",
    `    <object id="1" type="model" name="${escapeXml(name)}">`,
    "      <mesh>",
    "        <vertices>",
    ...vertices,
    "        </vertices>",
    "        <triangles>",
    ...triangles,
    "        </triangles>",
    "      </mesh>",
    "    </object>",
    "  </resources>",
    "  <build>",
    "    <item objectid=\"1\"/>",
    "  </build>",
    "</model>",
  ].join("\n");
}

function formatNum(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(6).replace(/\.0+$/, "").replace(/(\.\d+?)0+$/, "$1");
}

function escapeXml(value: string): string {
  return value.replace(/[<>&\"']/g, (ch) => {
    switch (ch) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "\"":
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return ch;
    }
  });
}
