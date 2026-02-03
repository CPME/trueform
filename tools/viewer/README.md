# Trueform Viewer (lightweight)

This is a minimal STL viewer for quick verification. It avoids showing mesh
triangulation by rendering smooth faces and only drawing sharp edges.

## Export geometry

```bash
npm run viewer:export
```

That writes `tools/viewer/assets/plate.stl`.

## View it

Install the viewer dependency (local, no CDN required):

```bash
cd tools/viewer
npm install
```

```bash
cd tools/viewer
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

You can load a different STL with:

```
http://localhost:8000/?file=./assets/your_part.stl
```
