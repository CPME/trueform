import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

const canvas = document.querySelector("#viewport");
const statusEl = document.querySelector("#status");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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

const loader = new STLLoader();
const params = new URLSearchParams(window.location.search);
const fileParam = params.get("file");
const debug = params.get("debug") === "1";
const filename = fileParam || "./assets/plate.stl";
const fileUrl = new URL(filename, window.location.href).toString();
let loadSucceeded = false;

statusEl.textContent = `Loading ${filename}`;

loader.load(
  fileUrl,
  (geometry) => {
    loadSucceeded = true;
    geometry.computeVertexNormals();
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

    const mesh = new THREE.Mesh(geometry, meshMaterial);
    scene.add(mesh);

    const vertexCount = geometry.attributes.position?.count ?? 0;
    const radius = Math.max(geometry.boundingSphere.radius || 0, 1);

    if (debug) {
      mesh.position.set(0, 0, 0);
      camera.position.set(0, 0, Math.max(radius * 3, 60));
      camera.lookAt(0, 0, 0);
      scene.add(new THREE.CameraHelper(camera));
    }

    const edges = new THREE.EdgesGeometry(geometry, debug ? 1 : 20);
    const linesMaterial = new THREE.LineBasicMaterial({
      color: debug ? "#ffd400" : "#1f1a14",
      linewidth: 1,
    });
    linesMaterial.depthTest = false;
    linesMaterial.transparent = true;
    linesMaterial.opacity = debug ? 1 : 0.9;
    const lines = new THREE.LineSegments(edges, linesMaterial);
    scene.add(lines);
    const distance = Math.max(radius * 2.4, 10);
    camera.position.set(distance, distance * 0.85, distance);
    controls.target.set(0, 0, 0);
    controls.update();

    if (debug) {
      renderer.setClearColor("#141414", 1);
      scene.background = new THREE.Color("#141414");

      const axes = new THREE.AxesHelper(radius * 0.6);
      scene.add(axes);
      const grid = new THREE.GridHelper(radius * 2.2, 20, "#6a6a6a", "#2a2a2a");
      grid.rotation.x = Math.PI / 2;
      scene.add(grid);

      const debugCube = new THREE.Mesh(
        new THREE.BoxGeometry(radius * 0.2, radius * 0.2, radius * 0.2),
        new THREE.MeshNormalMaterial()
      );
      scene.add(debugCube);

      const bbox = new THREE.Box3().setFromBufferAttribute(
        geometry.attributes.position
      );
      const bboxHelper = new THREE.Box3Helper(bbox, "#00ffc8");
      scene.add(bboxHelper);
    }

    const glInfo =
      debug && gl
        ? ` | ${gl.getParameter(gl.RENDERER)}`
        : "";
    statusEl.textContent = `Viewing ${filename} (verts: ${vertexCount}, r: ${radius.toFixed(
      2
    )})${glInfo}`;

    if (vertexCount === 0) {
      const fallback = new THREE.Mesh(
        new THREE.BoxGeometry(10, 10, 10),
        new THREE.MeshStandardMaterial({ color: "#c76d4a", roughness: 0.4 })
      );
      scene.add(fallback);
      statusEl.textContent =
        "STL loaded but empty — showing fallback cube. Check export.";
    }
  },
  undefined,
  (err) => {
    if (loadSucceeded) {
      console.warn("STL load error after success:", err);
      return;
    }
    statusEl.textContent = `Failed to load ${filename}`;
    console.error(err);
  }
);

function resize() {
  const { clientWidth, clientHeight } = renderer.domElement;
  const width = clientWidth || window.innerWidth;
  const height = clientHeight || window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (debug) {
    statusEl.textContent = `Viewing ${filename} (size: ${width}×${height})`;
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
