# TrueForm

Create an end-to-end engineering system that enables humans and agents to rapidly iterate on designs while validating them against simulation and manufacturing design rules.

Designs are authored in a rich DSL, stored in a central native open format, and exported as practical production artifacts (CAD with MBD/PMI, CAM, QIF). Exports stay simple and pragmatic, for example tolerances export as surface profile for CMM inspection.

If successful, hardware design should feel more like software: a single, digital definition is authored and released with rapid iteration, automated checks, and clean handoff to manufacturing.

**Quickstart**
```bash
cd /home/eveber/code/trueform
npm install
npm test
```

**Viewer (Verification Helper)**
```bash
cd /home/eveber/code/trueform
npm run viewer:export
cd /home/eveber/code/trueform/tools/viewer
npm install
python3 -m http.server 8001
```

Then open `http://localhost:8001` in a browser. Use `?debug=1` for axes/grid helpers.

**Docs**
- `aidocs/summary.md`
- `aidocs/spec.md`
- `aidocs/geometric-abstractions.md`
- `aidocs/functional-tolerancing-intent.md`
- `aidocs/mesh-viewer-debug.md`
- `aidocs/backend-interface.md`
- `aidocs/future-features.md`
