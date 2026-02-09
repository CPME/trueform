# TrueForm Viewer (lightweight)

This is a minimal mesh viewer for quick verification. It avoids showing mesh
triangulation by rendering smooth faces and drawing CAD-style B-Rep edges.

The default export uses a TrueForm DSL example (`src/examples/viewer_part.ts`)
compiled with OpenCascade.js and written to `tools/viewer/assets/plate.mesh.json`.

## Export geometry

```bash
npm run viewer:export
```

That writes `tools/viewer/assets/plate.mesh.json` from the DSL example, plus:
- `tools/viewer/assets/plate.iso.png` (shaded isometric snapshot)
- `tools/viewer/assets/plate.debug.json`
- `tools/viewer/assets/plate.selectors.json` (selector metadata for debug overlay)
- `tools/viewer/assets/plate-peg.assembly.json` (simple assembly manifest)
- `tools/viewer/assets/plate.edges.*.svg` (orthographic edge projections)
- `tools/viewer/assets/manifest.json` (asset picker list)
- `tools/viewer/assets/topology.json` (face/edge/solid counts per part)

Export is cached by default. To force a full rebuild, set:

```bash
TF_VIEWER_FORCE=1 npm run viewer:export
```

To export only specific parts, set `TF_VIEWER_ONLY` with a comma-separated list:

```bash
TF_VIEWER_ONLY=pipe_asm,bearing-housing npm run viewer:export
```

## Constraint sweeps (slider)

Generate a solver-validated slider sweep (no UI needed):

```bash
npm run viewer:slider-sweep
```

This solves each frame (seed + solve) and renders a looping GIF plus per-frame
metadata:
- `tools/viewer/assets/sweeps/slider-mate/slider-mate.gif`
- `tools/viewer/assets/sweeps/slider-mate/frames/` (PNG sequence)
- `tools/viewer/assets/sweeps/slider-mate/metadata.json`

Tuning (optional):

```bash
TF_SWEEP_X_MIN=0 TF_SWEEP_X_MAX=10 TF_SWEEP_FRAMES=48 TF_SWEEP_FPS=24 npm run viewer:slider-sweep
```

## Mesh format

The viewer expects a JSON payload with:
- `positions`: flat xyz array (length = 3 * vertex count).
- `indices`: triangle indices into `positions` (optional but recommended).
- `normals`: flat xyz array per vertex (optional; viewer will compute if missing).
- `edgePositions`: flat xyz array for line segments (optional, CAD-style edges).

## Assembly manifest format

Assemblies load a lightweight JSON manifest:
- `kind`: `"assembly"`.
- `id`: assembly id.
- `instances`: list of `{ id, part, mesh, transform, color? }`.
  - `mesh` points to a `*.mesh.json` asset.
  - `transform` is a 4x4 column-major matrix (length 16).

## View it

Install the viewer dependency (local, no CDN required):

```bash
cd tools/viewer
npm install
```

```bash
cd tools/viewer
python3 -m http.server 8001
```

Open `http://localhost:8001` in your browser.

Notes:
- If running the server in WSL, open the URL in a Windows browser.
- Use `?debug=1` to show axes/grid/debug helpers: `http://localhost:8001/?debug=1`.
- Use `?hidden=1` to show hidden edges (disable depth test).
- Load a different mesh with `?file=./assets/your_part.mesh.json`.
- Load an assembly with `?file=./assets/plate-peg.assembly.json`.
- The asset dropdown is populated from `tools/viewer/assets/manifest.json`.
- Edge rendering: `?edges=brep` (default), `?edges=faces`, or `?edges=mesh`.
- Selector overlay: `?selectors=1` (loads `*.selectors.json` if present).
- Reference overlay: load an image in the HUD or use `?ref=./assets/drawing.png`.
  Optional tuning params: `refOpacity` (0-1), `refScale`, `refX`, `refY`, `refRot`.
- You can also load a local mesh JSON via the file picker in the HUD and download a PNG snapshot.

## Debug outputs

`npm run viewer:export` also writes:
- `tools/viewer/assets/plate.debug.json`: face/edge counts, adjacency stats, bounds, mesh stats.
- `tools/viewer/assets/plate.edges.xy.svg`: orthographic edge projection (XY).
- `tools/viewer/assets/plate.edges.xz.svg`: orthographic edge projection (XZ).
- `tools/viewer/assets/plate.edges.yz.svg`: orthographic edge projection (YZ).
- `tools/viewer/assets/plate.iso.png`: shaded isometric snapshot.
- `tools/viewer/assets/manifest.json`: list of available `*.mesh.json` assets.

## Sanity check (optional)

From another shell:

```bash
curl -sSf http://localhost:8001/viewer.js >/dev/null
curl -sSf http://localhost:8001/assets/plate.mesh.json >/dev/null
```

You can load a different mesh with `?file=./assets/your_part.mesh.json`.
