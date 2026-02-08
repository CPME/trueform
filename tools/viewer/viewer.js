import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const canvas = document.querySelector("#viewport");
const statusEl = document.querySelector("#status");
const fileInput = document.querySelector("#file-input");
const fileUrlInput = document.querySelector("#file-url");
const loadUrlBtn = document.querySelector("#load-url");
const assetSelect = document.querySelector("#asset-select");
const loadAssetBtn = document.querySelector("#load-asset");
const downloadBtn = document.querySelector("#download-png");
const selectorInfo = document.querySelector("#selector-info");
const selectorPanel = document.querySelector("#selector-panel");
const refOverlay = document.querySelector("#ref-overlay");
const refInput = document.querySelector("#ref-input");
const refUrlInput = document.querySelector("#ref-url");
const loadRefBtn = document.querySelector("#load-ref");
const clearRefBtn = document.querySelector("#clear-ref");
const refOpacityInput = document.querySelector("#ref-opacity");
const refScaleInput = document.querySelector("#ref-scale");
const refOffsetXInput = document.querySelector("#ref-offset-x");
const refOffsetYInput = document.querySelector("#ref-offset-y");
const refRotationInput = document.querySelector("#ref-rotation");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(window.devicePixelRatio || 1);
renderer.setClearColor("#f9f7f4", 1);

const gl = renderer.getContext();
if (!gl) {
  statusEl.textContent = "WebGL context not available.";
  throw new Error("WebGL context not available");
}
if (gl.isContextLost && gl.isContextLost()) {
  statusEl.textContent = "WebGL context lost.";
  throw new Error("WebGL context lost");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f9f7f4");

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(40, 40, 40);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

scene.add(new THREE.HemisphereLight("#ffffff", "#d9d0c4", 0.8));
scene.add(new THREE.AmbientLight("#ffffff", 0.6));
const keyLight = new THREE.DirectionalLight("#ffffff", 1.3);
keyLight.position.set(40, 60, 30);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight("#d9d0c4", 0.55);
fillLight.position.set(-30, -20, -10);
scene.add(fillLight);

const modelGroup = new THREE.Group();
scene.add(modelGroup);
const selectorGroup = new THREE.Group();
scene.add(selectorGroup);

const params = new URLSearchParams(window.location.search);
const fileParam = params.get("file");
const debug = params.get("debug") === "1";
const selectorsEnabled = params.get("selectors") === "1";
const edgeSource = params.get("edges");
const showHidden = params.get("hidden") === "1";
const refParam = params.get("ref");
const refOpacityParam = params.get("refOpacity");
const refScaleParam = params.get("refScale");
const refOffsetXParam = params.get("refX");
const refOffsetYParam = params.get("refY");
const refRotationParam = params.get("refRot");
const filename = fileParam || "./assets/plate.mesh.json";
let currentLabel = filename;
if (fileUrlInput) fileUrlInput.value = filename;

const overlayState = {
  opacity: 0.4,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
};

loadMeshFromUrl(filename);
loadAssetManifest();

if (loadUrlBtn) {
  loadUrlBtn.addEventListener("click", () => {
    const nextFile = fileUrlInput?.value?.trim();
    if (!nextFile) return;
    loadMeshFromUrl(nextFile);
    updateUrlFileParam(nextFile);
  });
}

if (fileInput) {
  fileInput.addEventListener("change", (event) => {
    const target = event.target;
    const file = target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const meshData = JSON.parse(text);
        loadMeshData(meshData, file.name);
      } catch (err) {
        statusEl.textContent = "Failed to parse selected JSON file.";
        console.error(err);
      }
    };
    reader.readAsText(file);
  });
}

if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    renderer.render(scene, camera);
    renderer.domElement.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      const safe = currentLabel.replace(/[^\w.-]+/g, "_");
      link.download = `${safe || "mesh"}.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    });
  });
}

if (assetSelect && loadAssetBtn) {
  loadAssetBtn.addEventListener("click", () => {
    const choice = assetSelect.value;
    if (!choice) return;
    if (fileUrlInput) fileUrlInput.value = choice;
    loadMeshFromUrl(choice);
    updateUrlFileParam(choice);
  });
  assetSelect.addEventListener("change", () => {
    const choice = assetSelect.value;
    if (!choice) return;
    if (fileUrlInput) fileUrlInput.value = choice;
    loadMeshFromUrl(choice);
    updateUrlFileParam(choice);
  });
}

function applyOverlay() {
  if (!refOverlay) return;
  const tx = overlayState.offsetX;
  const ty = overlayState.offsetY;
  const scale = overlayState.scale;
  const rot = overlayState.rotation;
  refOverlay.style.opacity = String(overlayState.opacity);
  refOverlay.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rot}deg)`;
}

function setOverlaySource(src) {
  if (!refOverlay) return;
  if (!src) return;
  refOverlay.src = src;
  refOverlay.classList.remove("hidden");
}

function parseNumber(value, fallback) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

function syncOverlayInputs() {
  if (refOpacityInput) refOpacityInput.value = String(overlayState.opacity);
  if (refScaleInput) refScaleInput.value = String(overlayState.scale);
  if (refOffsetXInput) refOffsetXInput.value = String(overlayState.offsetX);
  if (refOffsetYInput) refOffsetYInput.value = String(overlayState.offsetY);
  if (refRotationInput) refRotationInput.value = String(overlayState.rotation);
}

function initOverlay() {
  if (refOpacityParam) overlayState.opacity = parseNumber(refOpacityParam, 0.4);
  if (refScaleParam) overlayState.scale = parseNumber(refScaleParam, 1);
  if (refOffsetXParam) overlayState.offsetX = parseNumber(refOffsetXParam, 0);
  if (refOffsetYParam) overlayState.offsetY = parseNumber(refOffsetYParam, 0);
  if (refRotationParam) overlayState.rotation = parseNumber(refRotationParam, 0);
  syncOverlayInputs();
  applyOverlay();
  if (refParam) {
    if (refUrlInput) refUrlInput.value = refParam;
    setOverlaySource(refParam);
  }
}

if (refInput) {
  refInput.addEventListener("change", (event) => {
    const target = event.target;
    const file = target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result ?? "");
      setOverlaySource(src);
    };
    reader.readAsDataURL(file);
  });
}

if (loadRefBtn && refUrlInput) {
  loadRefBtn.addEventListener("click", () => {
    const src = refUrlInput.value?.trim();
    if (!src) return;
    setOverlaySource(src);
  });
}

if (clearRefBtn) {
  clearRefBtn.addEventListener("click", () => {
    if (!refOverlay) return;
    refOverlay.src = "";
    refOverlay.classList.add("hidden");
  });
}

if (refOpacityInput) {
  refOpacityInput.addEventListener("input", (event) => {
    overlayState.opacity = parseNumber(event.target?.value, overlayState.opacity);
    applyOverlay();
  });
}

if (refScaleInput) {
  refScaleInput.addEventListener("input", (event) => {
    overlayState.scale = parseNumber(event.target?.value, overlayState.scale);
    applyOverlay();
  });
}

if (refOffsetXInput) {
  refOffsetXInput.addEventListener("change", (event) => {
    overlayState.offsetX = parseNumber(event.target?.value, overlayState.offsetX);
    applyOverlay();
  });
}

if (refOffsetYInput) {
  refOffsetYInput.addEventListener("change", (event) => {
    overlayState.offsetY = parseNumber(event.target?.value, overlayState.offsetY);
    applyOverlay();
  });
}

if (refRotationInput) {
  refRotationInput.addEventListener("change", (event) => {
    overlayState.rotation = parseNumber(event.target?.value, overlayState.rotation);
    applyOverlay();
  });
}

if (refOverlay) {
  refOverlay.addEventListener("load", () => {
    applyOverlay();
  });
}

initOverlay();

function resize() {
  const { clientWidth, clientHeight } = renderer.domElement;
  const width = clientWidth || window.innerWidth;
  const height = clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (debug) {
    statusEl.textContent = `Viewing ${currentLabel} (size: ${width}×${height})`;
  }
}

window.addEventListener("resize", resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

function loadMeshFromUrl(source) {
  currentLabel = source;
  statusEl.textContent = `Loading ${source}`;
  const fileUrl = new URL(source, window.location.href).toString();
  fetch(fileUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((meshData) => {
      loadMeshData(meshData, source);
    })
    .catch((err) => {
      statusEl.textContent = `Failed to load ${source}`;
      console.error(err);
    });
}

function updateUrlFileParam(source) {
  const url = new URL(window.location.href);
  url.searchParams.set("file", source);
  window.history.replaceState({}, "", url.toString());
}

function loadAssetManifest() {
  if (!assetSelect) return;
  const manifestUrl = "./assets/manifest.json";
  fetch(manifestUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const assets = Array.isArray(data?.assets)
        ? data.assets
        : Array.isArray(data)
          ? data
          : [];
      const cleaned = assets
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean);
      assetSelect.innerHTML = "";
      if (cleaned.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No assets found";
        assetSelect.appendChild(opt);
        assetSelect.disabled = true;
        return;
      }
      for (const asset of cleaned) {
        const opt = document.createElement("option");
        opt.value = asset;
        const label = asset.split("/").pop() || asset;
        opt.textContent = label;
        assetSelect.appendChild(opt);
      }
      assetSelect.disabled = false;
      if (cleaned.includes(filename)) {
        assetSelect.value = filename;
      } else {
        assetSelect.value = cleaned[0];
      }
    })
    .catch(() => {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "Manifest missing";
      assetSelect.innerHTML = "";
      assetSelect.appendChild(opt);
      assetSelect.disabled = true;
    });
}

function loadMeshData(meshData, label) {
  currentLabel = label;
  while (modelGroup.children.length > 0) {
    const child = modelGroup.children.pop();
    if (child) modelGroup.remove(child);
  }
  while (selectorGroup.children.length > 0) {
    const child = selectorGroup.children.pop();
    if (child) selectorGroup.remove(child);
  }
  if (selectorPanel) {
    selectorPanel.style.display = selectorsEnabled ? "block" : "none";
  }
  if (selectorInfo) {
    selectorInfo.textContent = selectorsEnabled
      ? "Loading selectors…"
      : "Selectors disabled. Add ?selectors=1";
  }

  const geometry = buildGeometry(meshData);
  if (!geometry) {
    statusEl.textContent = "Mesh missing position data.";
    throw new Error("Mesh missing position data");
  }
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const center = geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);

  const baseMaterial = new THREE.MeshStandardMaterial({
    color: "#c7a884",
    metalness: 0.05,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });

  const meshMaterial = debug
    ? new THREE.MeshNormalMaterial({ side: THREE.DoubleSide })
    : baseMaterial;

  const model = new THREE.Mesh(geometry, meshMaterial);
  modelGroup.add(model);

  const vertexCount = geometry.attributes.position?.count ?? 0;
  const radius = Math.max(geometry.boundingSphere.radius || 0, 1);

  if (debug) {
    model.position.set(0, 0, 0);
    camera.position.set(0, 0, Math.max(radius * 3, 60));
    camera.lookAt(0, 0, 0);
    modelGroup.add(new THREE.CameraHelper(camera));
  }

  const edgeGeometry = buildEdgeGeometry(
    meshData,
    geometry,
    debug,
    edgeSource,
    center
  );
  const linesMaterial = new THREE.LineBasicMaterial({
    color: debug ? "#ffd400" : "#1f1a14",
    linewidth: 1,
  });
  linesMaterial.depthTest = !showHidden;
  linesMaterial.depthWrite = false;
  if (!showHidden) {
    linesMaterial.polygonOffset = true;
    linesMaterial.polygonOffsetFactor = -1;
    linesMaterial.polygonOffsetUnits = -1;
  }
  linesMaterial.transparent = true;
  linesMaterial.opacity = debug ? 1 : 0.9;
  if (edgeGeometry) {
    const lines = new THREE.LineSegments(edgeGeometry, linesMaterial);
    modelGroup.add(lines);
  }
  const distance = Math.max(radius * 2.4, 10);
  camera.position.set(distance, distance * 0.85, distance);
  controls.target.set(0, 0, 0);
  controls.update();

  if (debug) {
    renderer.setClearColor("#141414", 1);
    scene.background = new THREE.Color("#141414");

    const axes = new THREE.AxesHelper(radius * 0.6);
    modelGroup.add(axes);
    const grid = new THREE.GridHelper(radius * 2.2, 20, "#6a6a6a", "#2a2a2a");
    grid.rotation.x = Math.PI / 2;
    modelGroup.add(grid);

    const debugCube = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.2, radius * 0.2, radius * 0.2),
      new THREE.MeshNormalMaterial()
    );
    modelGroup.add(debugCube);

    const bbox = new THREE.Box3().setFromBufferAttribute(
      geometry.attributes.position
    );
    const bboxHelper = new THREE.Box3Helper(bbox, "#00ffc8");
    modelGroup.add(bboxHelper);
  }

  const glInfo = debug && gl ? ` | ${gl.getParameter(gl.RENDERER)}` : "";
  statusEl.textContent = `Viewing ${label} (verts: ${vertexCount}, r: ${radius.toFixed(
    2
  )})${glInfo}`;

  if (selectorsEnabled) {
    loadSelectors(meshData, label, center, radius).catch((err) => {
      if (selectorInfo) {
        selectorInfo.textContent = `Selectors unavailable: ${err.message || err}`;
      }
      console.error(err);
    });
  }

  if (vertexCount === 0) {
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(10, 10, 10),
      new THREE.MeshStandardMaterial({ color: "#c76d4a", roughness: 0.4 })
    );
    modelGroup.add(fallback);
    statusEl.textContent =
      "Mesh loaded but empty — showing fallback cube. Check export.";
  }
}

function buildGeometry(mesh) {
  if (!mesh || !Array.isArray(mesh.positions)) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(mesh.positions, 3)
  );
  if (Array.isArray(mesh.normals)) {
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(mesh.normals, 3)
    );
  }
  if (Array.isArray(mesh.indices) && mesh.indices.length > 0) {
    geometry.setIndex(mesh.indices);
  }
  return geometry;
}

function buildEdgeGeometry(mesh, meshGeometry, debug, edgeSource, center) {
  const source = (edgeSource || "brep").toLowerCase();
  const applyCenter = (geometry) => {
    if (geometry && center) geometry.translate(-center.x, -center.y, -center.z);
    return geometry;
  };

  if (source === "brep") {
    if (mesh && Array.isArray(mesh.edgePositions) && mesh.edgePositions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(mesh.edgePositions, 3)
      );
      if (Array.isArray(mesh.edgeIndices) && mesh.edgeIndices.length > 0) {
        geometry.setIndex(mesh.edgeIndices);
      }
      return applyCenter(geometry);
    }
    const faceEdges = buildFaceBoundaryEdges(mesh);
    if (faceEdges) return applyCenter(faceEdges);
  }

  if (source === "faces") {
    const faceEdges = buildFaceBoundaryEdges(mesh);
    if (faceEdges) return applyCenter(faceEdges);
  }

  if (source === "mesh" && meshGeometry) {
    return new THREE.EdgesGeometry(meshGeometry, debug ? 1 : 20);
  }

  if (meshGeometry) {
    return new THREE.EdgesGeometry(meshGeometry, debug ? 1 : 20);
  }
  return null;
}

function buildFaceBoundaryEdges(mesh) {
  if (!mesh || !Array.isArray(mesh.indices) || !Array.isArray(mesh.faceIds)) {
    return null;
  }
  const positions = mesh.positions;
  const indices = mesh.indices;
  if (!Array.isArray(positions) || positions.length === 0) return null;

  const edgeMap = new Map();
  const addEdge = (a, b, faceId) => {
    if (a === undefined || b === undefined) return;
    const ia = a < b ? a : b;
    const ib = a < b ? b : a;
    const key = `${ia},${ib}`;
    let entry = edgeMap.get(key);
    if (!entry) {
      entry = { a: ia, b: ib, faces: new Set(), count: 0 };
      edgeMap.set(key, entry);
    }
    entry.count += 1;
    entry.faces.add(faceId);
  };

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const faceId = mesh.faceIds[Math.floor(i / 3)];
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    addEdge(a, b, faceId);
    addEdge(b, c, faceId);
    addEdge(c, a, faceId);
  }

  const linePositions = [];
  for (const entry of edgeMap.values()) {
    if (!entry) continue;
    if (entry.count >= 2 && entry.faces.size <= 1) continue;
    const ia = entry.a * 3;
    const ib = entry.b * 3;
    linePositions.push(
      positions[ia],
      positions[ia + 1],
      positions[ia + 2],
      positions[ib],
      positions[ib + 1],
      positions[ib + 2]
    );
  }

  if (linePositions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(linePositions, 3)
  );
  return geometry;
}

async function loadSelectors(meshData, label, center, radius) {
  const directSelections = Array.isArray(meshData?.selections)
    ? meshData.selections
    : null;
  if (directSelections) {
    applySelectors(directSelections, center, radius);
    return;
  }

  const selectorsUrl = selectorsUrlForLabel(label);
  if (!selectorsUrl) {
    if (selectorInfo) {
      selectorInfo.textContent =
        "Selectors not embedded and no selectors file found.";
    }
    return;
  }

  const res = await fetch(new URL(selectorsUrl, window.location.href).toString());
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for selectors`);
  }
  const data = await res.json();
  const selections = Array.isArray(data?.selections)
    ? data.selections
    : Array.isArray(data)
      ? data
      : [];
  applySelectors(selections, center, radius);
}

function selectorsUrlForLabel(label) {
  if (typeof label !== "string") return null;
  if (!label.includes(".mesh.json")) return null;
  return label.replace(".mesh.json", ".selectors.json");
}

function applySelectors(selections, center, radius) {
  if (!Array.isArray(selections)) selections = [];
  const summary = summarizeSelections(selections);
  if (selectorInfo) {
    selectorInfo.textContent = formatSelectionSummary(summary, selections);
  }

  const baseSize = Math.max(radius * 0.02, 0.6);
  const geometries = {
    face: new THREE.SphereGeometry(baseSize, 10, 10),
    edge: new THREE.SphereGeometry(baseSize * 0.7, 10, 10),
    solid: new THREE.SphereGeometry(baseSize * 0.9, 10, 10),
  };
  const materials = {
    face: new THREE.MeshBasicMaterial({ color: "#1fa3ff" }),
    edge: new THREE.MeshBasicMaterial({ color: "#ff9f1a" }),
    solid: new THREE.MeshBasicMaterial({ color: "#8b5cf6" }),
  };

  for (const selection of selections) {
    if (!selection || typeof selection !== "object") continue;
    const kind = selection.kind || "face";
    const meta = selection.meta || {};
    const point = Array.isArray(meta.center) ? meta.center : null;
    if (!point || point.length < 3) continue;
    const geom = geometries[kind] || geometries.face;
    const mat = materials[kind] || materials.face;
    const marker = new THREE.Mesh(geom, mat);
    marker.position.set(
      point[0] - center.x,
      point[1] - center.y,
      point[2] - center.z
    );
    marker.userData = { selection };
    selectorGroup.add(marker);

    if (kind === "face" && Array.isArray(meta.normalVec)) {
      const [nx, ny, nz] = meta.normalVec;
      const len = Math.max(baseSize * 2, 1.5);
      const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(nx, ny, nz).normalize(),
        new THREE.Vector3(
          point[0] - center.x,
          point[1] - center.y,
          point[2] - center.z
        ),
        len,
        0x2dd4bf
      );
      selectorGroup.add(arrow);
    }
  }
}

function summarizeSelections(selections) {
  const summary = { total: 0, byKind: { face: 0, edge: 0, solid: 0 } };
  for (const selection of selections) {
    if (!selection) continue;
    summary.total += 1;
    const kind = selection.kind || "face";
    summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
  }
  return summary;
}

function formatSelectionSummary(summary, selections) {
  const lines = [];
  lines.push(`Total: ${summary.total}`);
  lines.push(
    `Faces: ${summary.byKind.face || 0} | Edges: ${summary.byKind.edge || 0} | Solids: ${
      summary.byKind.solid || 0
    }`
  );
  lines.push("---");
  const preview = selections.slice(0, 18);
  for (const selection of preview) {
    if (!selection || typeof selection !== "object") continue;
    const meta = selection.meta || {};
    const createdBy = meta.createdBy ? ` createdBy=${meta.createdBy}` : "";
    const normal = meta.normal ? ` normal=${meta.normal}` : "";
    const tags =
      Array.isArray(meta.featureTags) && meta.featureTags.length > 0
        ? ` tags=[${meta.featureTags.join(", ")}]`
        : "";
    lines.push(`${selection.id} (${selection.kind})${createdBy}${normal}${tags}`);
  }
  if (selections.length > preview.length) {
    lines.push(`... ${selections.length - preview.length} more`);
  }
  return lines.join("\n");
}
