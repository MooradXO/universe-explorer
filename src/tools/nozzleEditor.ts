import * as THREE from 'three';
// @ts-ignore
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { loadModelClone } from '../world/ModelLoader';
import { PLAYER_SHIP_VISUAL } from '../world/ShipVisualConfig';

interface NozzleHandle {
  button: HTMLButtonElement;
  group: THREE.Group;
  ring: THREE.Mesh;
  core: THREE.Mesh;
  plumeA: THREE.Mesh;
  plumeB: THREE.Mesh;
  size: number;
}

function mustQuery<TElement extends Element>(selector: string) {
  const element = document.querySelector<TElement>(selector);
  if (!element) {
    throw new Error(`Nozzle editor HTML is missing required control: ${selector}`);
  }
  return element;
}

const app = mustQuery<HTMLDivElement>('#app');
const pointsContainer = mustQuery<HTMLDivElement>('#points');
const jsonOutput = mustQuery<HTMLTextAreaElement>('#json');
const copyButton = mustQuery<HTMLButtonElement>('#copy');
const resetButton = mustQuery<HTMLButtonElement>('#reset');
const xInput = mustQuery<HTMLInputElement>('#x');
const yInput = mustQuery<HTMLInputElement>('#y');
const zInput = mustQuery<HTMLInputElement>('#z');
const sizeInput = mustQuery<HTMLInputElement>('#size');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x02040a, 1);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040a, 0.0015);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 5000);
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.08;
orbitControls.minDistance = 55;
orbitControls.maxDistance = 600;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode('translate');
transformControls.setSpace('local');
transformControls.setSize(0.78);
scene.add(transformControls);

const clock = new THREE.Clock();
const shipGroup = new THREE.Group();
scene.add(shipGroup);

const ambient = new THREE.AmbientLight(0x8bc8ff, 1.35);
const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
keyLight.position.set(160, 240, 280);
const rimLight = new THREE.DirectionalLight(0x2bdcff, 1.8);
rimLight.position.set(-180, 40, 220);
scene.add(ambient, keyLight, rimLight);

const starGeometry = new THREE.BufferGeometry();
const starPositions: number[] = [];
for (let i = 0; i < 1200; i += 1) {
  starPositions.push(
    THREE.MathUtils.randFloatSpread(1800),
    THREE.MathUtils.randFloatSpread(1000),
    THREE.MathUtils.randFloat(-900, 450)
  );
}
starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0x9fdcff,
    size: 1.25,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  })
);
scene.add(stars);

const textureLoader = new THREE.TextureLoader();

function loadVfxTexture(path: string, rotate = false) {
  const texture = textureLoader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (rotate) {
    texture.center.set(0.5, 0.5);
    texture.rotation = Math.PI / 2;
  }
  return texture;
}

const coreTexture = loadVfxTexture('/textures/vfx/thruster_core.png');
const plumeTexture = loadVfxTexture('/textures/vfx/thruster_plume.png', true);
const idleTexture = loadVfxTexture('/textures/vfx/thruster_idle.png');

const ringGeometry = new THREE.TorusGeometry(5.7, 0.34, 8, 36);
const coreGeometry = new THREE.PlaneGeometry(1, 1);
const plumeGeometry = new THREE.PlaneGeometry(1, 1);
plumeGeometry.rotateX(Math.PI / 2);
plumeGeometry.translate(0, 0, 0.5);

function makeAdditiveMaterial(map: THREE.Texture, opacity: number, color = PLAYER_SHIP_VISUAL.engineColor) {
  return new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    alphaTest: 0.01,
  });
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const handles: NozzleHandle[] = [];
let selectedIndex = 0;

function setView(position: THREE.Vector3Tuple, target: THREE.Vector3Tuple) {
  camera.position.set(position[0], position[1], position[2]);
  orbitControls.target.set(target[0], target[1], target[2]);
  orbitControls.update();
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function exportJson() {
  jsonOutput.value = JSON.stringify(
    {
      modelPath: PLAYER_SHIP_VISUAL.modelPath,
      scale: PLAYER_SHIP_VISUAL.scale,
      rotation: PLAYER_SHIP_VISUAL.rotation,
      nozzles: handles.map((handle) => [
        round(handle.group.position.x),
        round(handle.group.position.y),
        round(handle.group.position.z),
      ]),
      sizes: handles.map((handle) => round(handle.size)),
    },
    null,
    2
  );
}

function applyHandleSize(handle: NozzleHandle) {
  const scale = handle.size;
  handle.ring.scale.setScalar(scale);
  handle.core.scale.setScalar(10.5 * scale);
  handle.plumeA.scale.set(8.5 * scale, 1, 28 * scale);
  handle.plumeB.scale.set(7 * scale, 1, 24 * scale);
}

function syncInputsFromSelected() {
  const handle = handles[selectedIndex];
  if (!handle) return;

  xInput.value = String(round(handle.group.position.x));
  yInput.value = String(round(handle.group.position.y));
  zInput.value = String(round(handle.group.position.z));
  sizeInput.value = String(round(handle.size));
  exportJson();
}

function selectHandle(index: number) {
  selectedIndex = THREE.MathUtils.clamp(index, 0, handles.length - 1);
  handles.forEach((handle, handleIndex) => {
    handle.button.classList.toggle('active', handleIndex === selectedIndex);
    const ringMaterial = handle.ring.material as THREE.MeshBasicMaterial;
    ringMaterial.color.setHex(handleIndex === selectedIndex ? 0xffffff : 0x35e7ff);
    ringMaterial.opacity = handleIndex === selectedIndex ? 0.95 : 0.45;
  });
  transformControls.attach(handles[selectedIndex].group);
  syncInputsFromSelected();
}

function createHandle(position: readonly [number, number, number], index: number) {
  const group = new THREE.Group();
  group.name = `nozzle-${index + 1}`;
  group.position.set(position[0], position[1], position[2]);

  const ring = new THREE.Mesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({
      color: 0x35e7ff,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  const core = new THREE.Mesh(coreGeometry, makeAdditiveMaterial(coreTexture, 0.92));
  core.position.z = 1.4;

  const idleGlow = new THREE.Mesh(coreGeometry, makeAdditiveMaterial(idleTexture, 0.32));
  idleGlow.position.z = 1.2;
  idleGlow.scale.setScalar(16);

  const plumeA = new THREE.Mesh(plumeGeometry, makeAdditiveMaterial(plumeTexture, 0.62));
  const plumeB = new THREE.Mesh(plumeGeometry, makeAdditiveMaterial(plumeTexture, 0.52));
  plumeA.position.z = 2.2;
  plumeB.position.z = 2.2;
  plumeB.rotation.z = Math.PI / 2;

  group.add(ring, idleGlow, plumeA, plumeB, core);
  shipGroup.add(group);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `P${index + 1}`;
  button.addEventListener('click', () => selectHandle(index));
  pointsContainer.appendChild(button);

  const handle: NozzleHandle = {
    button,
    group,
    ring,
    core,
    plumeA,
    plumeB,
    size: PLAYER_SHIP_VISUAL.nozzleSizes?.[index] ?? 1,
  };
  applyHandleSize(handle);
  handles.push(handle);
}

function updateSelectedFromInputs() {
  const handle = handles[selectedIndex];
  if (!handle) return;

  const x = Number.parseFloat(xInput.value);
  const y = Number.parseFloat(yInput.value);
  const z = Number.parseFloat(zInput.value);
  const size = Number.parseFloat(sizeInput.value);

  if (Number.isFinite(x)) handle.group.position.x = x;
  if (Number.isFinite(y)) handle.group.position.y = y;
  if (Number.isFinite(z)) handle.group.position.z = z;
  if (Number.isFinite(size)) {
    handle.size = THREE.MathUtils.clamp(size, 0.2, 3);
    applyHandleSize(handle);
  }

  transformControls.attach(handle.group);
  exportJson();
}

function resetHandles() {
  PLAYER_SHIP_VISUAL.nozzles.forEach((position, index) => {
    const handle = handles[index];
    handle.group.position.set(position[0], position[1], position[2]);
    handle.size = PLAYER_SHIP_VISUAL.nozzleSizes?.[index] ?? 1;
    applyHandleSize(handle);
  });
  selectHandle(0);
}

function handlePointerDown(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const intersections = raycaster.intersectObjects(handles.map((handle) => handle.group), true);
  const hit = intersections.find((intersection) => {
    let object: THREE.Object3D | null = intersection.object;
    while (object) {
      if (handles.some((handle) => handle.group === object)) return true;
      object = object.parent;
    }
    return false;
  });

  if (!hit) return;

  let object: THREE.Object3D | null = hit.object;
  while (object) {
    const index = handles.findIndex((handle) => handle.group === object);
    if (index !== -1) {
      selectHandle(index);
      return;
    }
    object = object.parent;
  }
}

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

for (const nozzle of PLAYER_SHIP_VISUAL.nozzles) {
  createHandle(nozzle, handles.length);
}

void loadModelClone(PLAYER_SHIP_VISUAL.modelPath).then((model) => {
  model.scale.setScalar(PLAYER_SHIP_VISUAL.scale);
  model.rotation.set(
    PLAYER_SHIP_VISUAL.rotation[0],
    PLAYER_SHIP_VISUAL.rotation[1],
    PLAYER_SHIP_VISUAL.rotation[2]
  );
  shipGroup.add(model);
}).catch((error: unknown) => {
  console.error('Failed to load player ship model for nozzle editor:', error);
});

transformControls.addEventListener('dragging-changed', (event) => {
  orbitControls.enabled = event.value !== true;
});
transformControls.addEventListener('objectChange', syncInputsFromSelected);

renderer.domElement.addEventListener('pointerdown', handlePointerDown);
window.addEventListener('resize', resize);
resetButton.addEventListener('click', resetHandles);
xInput.addEventListener('input', updateSelectedFromInputs);
yInput.addEventListener('input', updateSelectedFromInputs);
zInput.addEventListener('input', updateSelectedFromInputs);
sizeInput.addEventListener('input', updateSelectedFromInputs);
copyButton.addEventListener('click', () => {
  void navigator.clipboard.writeText(jsonOutput.value).then(() => {
    copyButton.textContent = 'Copied';
    window.setTimeout(() => {
      copyButton.textContent = 'Copy JSON';
    }, 900);
  });
});

document.querySelector<HTMLButtonElement>('#view-rear')?.addEventListener('click', () => {
  setView([0, 55, 245], [0, 0, 45]);
});
document.querySelector<HTMLButtonElement>('#view-top')?.addEventListener('click', () => {
  setView([0, 260, 25], [0, 0, 35]);
});
document.querySelector<HTMLButtonElement>('#view-side')?.addEventListener('click', () => {
  setView([250, 45, 45], [0, 0, 45]);
});

selectHandle(0);
setView([0, 55, 245], [0, 0, 45]);

function animate() {
  const elapsed = clock.getElapsedTime();
  const pulse = 0.86 + Math.sin(elapsed * 7.2) * 0.08 + Math.sin(elapsed * 21) * 0.035;
  for (const handle of handles) {
    handle.core.scale.setScalar(10.5 * handle.size * pulse);
  }

  orbitControls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
