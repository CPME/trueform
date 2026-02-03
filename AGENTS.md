No need to ask, just keep working on the project if it's low risk. Especially if you already have documentation to work off of and the project is not complete. I will maintain the documentation to reflect the application I want to see.

## Viewer (verification helper)

Lightweight STL viewer lives in `tools/viewer/` and is meant only for quick visual verification.

### Export geometry

```bash
cd /home/eveber/code/trueform.js
npm run viewer:export
```

This writes `tools/viewer/assets/plate.stl`.

### Run the viewer (local)

```bash
cd /home/eveber/code/trueform.js/tools/viewer
npm install
python3 -m http.server 8001
```

Open `http://localhost:8001` in a browser.

Notes:
- If running the server in WSL, open the URL in a Windows browser.
- Use `?debug=1` to show axes/grid/debug helpers: `http://localhost:8001/?debug=1`.
- Load a different STL via `?file=./assets/your_part.stl`.

## Tests

Run all tests (build + e2e):

```bash
cd /home/eveber/code/trueform.js
npm test
```
