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
- `tools/viewer/assets/plate.edges.*.svg` (orthographic edge projections)
- `tools/viewer/assets/manifest.json` (asset picker list)

## Mesh format

The viewer expects a JSON payload with:
- `positions`: flat xyz array (length = 3 * vertex count).
- `indices`: triangle indices into `positions` (optional but recommended).
- `normals`: flat xyz array per vertex (optional; viewer will compute if missing).
- `edgePositions`: flat xyz array for line segments (optional, CAD-style edges).

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
- The asset dropdown is populated from `tools/viewer/assets/manifest.json`.
- Edge rendering: `?edges=brep` (default), `?edges=faces`, or `?edges=mesh`.
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
