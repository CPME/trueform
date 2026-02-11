# File Format (.tfp / .tfa direction)

TrueForm’s part file type is a `.tfp` container that stores the authoritative
IR plus optional preview artifacts (mesh + isometric thumbnail). The IR is the
source of truth. Preview artifacts are caches and can be regenerated.

Step 1 contract direction:
- Part connectors are stored with part intent (`.tfp`).
- Assembly intent is stored in a separate assembly container/file (`.tfa` draft).

## Container Types

- `.tfp` (part container): implemented.
- `.tfa` (assembly container): contract direction; schema and tooling are in progress.

## Container Layout

`.tfp` is a zip container with fixed top-level entries:

```
my_part.tfp
  manifest.json
  document.json
  artifacts/
    part.mesh.json
    preview.png
```

Draft `.tfa` layout:

```
my_assembly.tfa
  manifest.json
  document.json
  artifacts/
    assembly.preview.json
```

## document.json (Authoritative IR)

The document is the canonical, kernel-agnostic intent model.

Part document (`.tfp`) example:

```
{
  "schema": "trueform.document.v1",
  "document": {
    "id": "doc-1",
    "parts": [ /* IntentPart[] */ ],
    "assemblies": [],
    "capabilities": {},
    "constraints": [],
    "assertions": [],
    "context": {
      "units": "mm",
      "kernel": { "name": "ocjs", "version": "X.Y.Z" },
      "tolerance": { "linear": 1e-6, "angular": 1e-6 }
    }
  }
}
```

Assembly document (`.tfa`) draft example:

```
{
  "schema": "trueform.document.v1",
  "document": {
    "id": "asm-doc-1",
    "imports": [
      {
        "id": "part:plate",
        "path": "parts/plate.tfp",
        "partId": "plate",
        "documentHash": "sha256:..."
      },
      {
        "id": "part:peg",
        "path": "parts/peg.tfp",
        "partId": "peg",
        "documentHash": "sha256:..."
      }
    ],
    "parts": [],
    "assemblies": [ /* IntentAssembly[] */ ],
    "capabilities": {},
    "constraints": [],
    "assertions": [],
    "context": {
      "units": "mm",
      "kernel": { "name": "ocjs", "version": "X.Y.Z" },
      "tolerance": { "linear": 1e-6, "angular": 1e-6 }
    }
  }
}
```

## Assembly -> Part References (Draft Direction)

To connect assembly documents to part documents, use `document.imports` in
assembly files:

```
{
  "id": "part:plate",
  "path": "parts/plate.tfp",
  "partId": "plate",
  "documentHash": "sha256:..."
}
```

Field meaning:
- `id`: local import key within the assembly document.
- `path`: relative location of the part container (`.tfp`).
- `partId`: target part id inside the imported part document.
- `documentHash`: optional integrity lock for reproducible builds.

Assembly instance resolution rule (draft):
- `AssemblyInstance.part` refers to `imports[].id`, not a free-form global id.
- `AssemblyRef = { instance, connector }` stays unchanged.
- Connectors remain defined in the referenced part document.

Notes:
- This is a Step 1 contract direction; schema/tooling implementation is pending.
- Existing inline/bundle workflows are still supported during migration.

## Bundle Compatibility And Migration (Step 1)

Legacy bundle format (single document with both `parts` and `assemblies`) is
supported during transition.

Read compatibility:
- Loaders accept legacy bundles and split formats.
- For legacy bundles, loaders synthesize virtual imports:
  - `id = "part:<part.id>"`
  - `partId = <part.id>`
  - `path` omitted (in-document source)

Write behavior:
- Default write mode is split:
  - part documents in `.tfp`
  - assembly documents in `.tfa` with `document.imports`
- Legacy bundle write mode is compatibility-only and must be explicit.

Deprecation direction:
1. Transition: read both formats; write split by default.
2. Next minor: warn on legacy bundle writes.
3. Next major: remove legacy bundle writes; retain legacy bundle reads.

Notes:
- The IR stores no kernel history or B-Rep.
- Feature order in arrays is preserved.
- In v1 direction, part connectors are defined in part documents.
- In v1 direction, assembly intent is serialized in separate assembly documents.

## manifest.json (Container Metadata)

The manifest declares schema versions, document hashes, and optional preview
artifacts.

```
{
  "schema": "trueform.container.v1",
  "createdAt": "2026-02-07T00:00:00Z",
  "document": {
    "path": "document.json",
    "schema": "trueform.document.v1",
    "hash": "sha256:...",
    "bytes": 12345
  },
  "artifacts": [
    {
      "type": "mesh",
      "path": "artifacts/part.mesh.json",
      "hash": "sha256:...",
      "bytes": 23456
    },
    {
      "type": "preview",
      "path": "artifacts/preview.png",
      "hash": "sha256:...",
      "bytes": 1024
    }
  ]
}
```

Notes:
- Hashes are SHA-256 over canonical JSON.
- Artifacts are optional and non-authoritative.
- `mesh` artifacts are intended for lightweight previews (low or medium
  resolution).
- `preview` artifacts are isometric thumbnails.
- Keep export-quality meshes and other artifacts as sidecar files
  (e.g. `*.mesh.json`, `*.iso.png`, `*.pmi.json`).

## Canonical JSON and Hashing

When hashing `document.json`:
- Object keys are sorted lexicographically.
- Array order is preserved.
- `undefined` values are omitted.

This ensures stable hashes for caching and diffing.

## File Handling

Open:
1. Unzip the `.tfp` (part) or `.tfa` (assembly) container.
2. Parse `manifest.json` and `document.json`.
3. Validate schema versions.
4. Hash `document.json` and compare to manifest.
5. Load artifacts if present and hashes match.

Save:
1. Serialize the IR to `document.json`.
2. Compute document hash and update `manifest.json`.
3. Optionally include preview mesh + thumbnail artifacts and hashes.
4. Zip into a `.tfp` (part) or `.tfa` (assembly) container.
5. Optionally regenerate sidecar artifacts.

## Minimal Example

The repository includes a minimal example container:
- `tools/tf/examples/minimal.tfp`

It is generated by:

```
node tools/tf/build_minimal_example.mjs
```

The implementation lives in:
- `src/tf/container.ts`
