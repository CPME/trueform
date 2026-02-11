import type { MeshOptions } from "./backend.js";

export type MeshProfile = "interactive" | "preview" | "export";

export const MESH_PROFILE_DEFAULTS: Record<MeshProfile, MeshOptions> = {
  interactive: {
    linearDeflection: 0.5,
    angularDeflection: 0.5,
    relative: true,
    includeEdges: true,
    edgeSegmentLength: 2,
    edgeMaxSegments: 48,
  },
  preview: {
    linearDeflection: 0.2,
    angularDeflection: 0.3,
    relative: true,
    includeEdges: true,
    edgeSegmentLength: 1,
    edgeMaxSegments: 96,
  },
  export: {
    linearDeflection: 0.02,
    angularDeflection: 0.1,
    relative: true,
    includeEdges: false,
  },
};

export function meshOptionsForProfile(
  profile: MeshProfile,
  overrides: MeshOptions = {}
): MeshOptions {
  return { ...MESH_PROFILE_DEFAULTS[profile], ...overrides };
}
