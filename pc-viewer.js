// ── Widok 3D budowy PC ──────────────────────────────────
// Renderuje TYLKO to, co dostanie: {modelIndex, trayCount}. Nie zna zadań,
// nie liczy kawałków i nie dotyka Firestore — całą mechanikę trzyma notes.js
// (addPiecesToBuild / applyPenaltyToBuild / ensurePcBuild).
//
// Three.js ładujemy DYNAMICZNIE, dopiero przy pierwszym pokazaniu widoku.
// Statyczny `import` wciągnąłby CDN do grafu modułów całej apki, więc offline
// albo niedostępny unpkg wywracałby LifeXP w całości zamiast zdegradować jeden
// panel. Gdy import padnie, notes.js pokazuje swój wariant 2D (paski 0-3).

// Ta sama wersja i CDN co FPS Prototype (fps.html) oraz devDependency w
// package.json — jedna wersja Three.js na projekt.
const THREE_URL  = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const LOADER_URL = 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const MODEL_PATH = (n) => `assets/pc/pc-${n}.glb`;
const MODEL_COUNT = 6;

// Kąt patrzenia: modele mają CELOWO otwartą przednią ścianę, więc kamera musi
// zaglądać do środka. Azymut liczony wokół osi Y, elewacja nad poziomem —
// wartości z testu użytkownika, trzymane tu jako stałe do dostrojenia.
const CAM_AZIMUTH_DEG   = 180;
const CAM_ELEVATION_DEG = 10;
// Dystans jako mnożnik promienia sfery otaczającej. 2.5 wynika z pomiaru:
// wszystkie pc-N.glb mają IDENTYCZNY bbox 27×49×61 (wyznacza go obudowa,
// komponenty siedzą w środku), czyli promień ≈ 41.5. Przy FOV 42° daje to
// widoczne pół-pole ~40 w pionie i ~48 w poziomie nawet na wąskim telefonie —
// model (pół-wysokość 24.5) mieści się z zapasem RAZEM z tacą obok.
// Stały bbox ma miłą konsekwencję: kadr nie skacze, gdy model się rozrasta.
const CAM_DISTANCE_MUL  = 2.5;

const IDLE_BEFORE_SPIN_MS = 4000;
const AUTO_SPIN_SPEED     = 0.25;  // rad/s

let THREE = null;
let GLTFLoader = null;
let libsPromise = null;

function loadThree() {
  if (libsPromise) return libsPromise;
  libsPromise = Promise.all([import(THREE_URL), import(LOADER_URL)])
    .then(([three, loader]) => { THREE = three; GLTFLoader = loader.GLTFLoader; return true; })
    .catch((err) => { console.error('[PC 3D] Three.js niedostępny:', err); return false; });
  return libsPromise;
}

// ── Stan sceny ──
// Jedna instancja na całą apkę: kontener jest jeden (#pcbuild-view), a trzymanie
// kontekstu WebGL przy życiu między wejściami w zakładkę jest tańsze niż
// stawianie go od nowa.
let scene, camera, renderer, modelRoot, trayRoot, ambient, dirLight;
let container = null;
let resizeObserver = null;
let rafId = null;           // null = pętla ZATRZYMANA
let running = false;
let lastFrameAt = 0;
let lastInteractionAt = 0;
let yaw = 0, pitch = 0;
let dragging = false, lastX = 0, lastY = 0;
let currentModelIndex = null;
let modelToken = 0;         // ubija wyścig, gdy postęp zmieni się w trakcie ładowania

function deg(d) { return d * Math.PI / 180; }

function buildScene() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearAlpha(0);                       // tło bierze motyw apki

  ambient = new THREE.AmbientLight(0xffffff, 1.6);
  dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.position.set(1, 2, 1.5);
  scene.add(ambient, dirLight);

  modelRoot = new THREE.Group();
  trayRoot = new THREE.Group();
  scene.add(modelRoot, trayRoot);

  yaw = deg(CAM_AZIMUTH_DEG);
  pitch = deg(CAM_ELEVATION_DEG);
}

// Kamera ustawiana z bounding boxa WCZYTANEGO modelu, nie z zapieczonych
// współrzędnych — pliki pc-N.glb rosną wraz z postępem, więc ich rozmiar się
// zmienia i sztywna odległość albo by je przycinała, albo gubiła w oddali.
let frameRadius = 60;
let frameCenter = null;

function frameObject(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  frameRadius = sphere.radius || 60;
  frameCenter = sphere.center.clone();
  // Model przesuwamy tak, żeby jego środek był w (0,0,0) — obrót kamery wokół
  // origin jest wtedy obrotem wokół modelu, bez dryfu.
  obj.position.sub(frameCenter);
  // Taca stoi OBOK modelu, nie w nim — ale wciąż w kadrze: przy mnożniku
  // dystansu 2.5 poziome pół-pole to ~48 jednostek, a 0.85×promień ≈ 35.
  trayRoot.position.set(frameRadius * 0.85, -frameRadius * 0.62, frameRadius * 0.35);
}

function updateCamera() {
  const r = frameRadius * CAM_DISTANCE_MUL;
  camera.position.set(
    r * Math.sin(yaw) * Math.cos(pitch),
    r * Math.sin(pitch),
    r * Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(0, 0, 0);
}

// ── Taca z kawałkami ──
// Czysta dekoracja: liczba brył = postęp aktualnego komponentu (0-2), a KTÓRE
// bryły to będą, losujemy przy każdym renderze — celowo, zgodnie z ustaleniem
// "mogą być jakieś losowe". Zero plików, same prymitywy.
function makePiece(i) {
  const kinds = ['box', 'cyl', 'sphere', 'cone'];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const s = frameRadius * 0.12;
  let geo;
  if (kind === 'box')         geo = new THREE.BoxGeometry(s, s, s);
  else if (kind === 'cyl')    geo = new THREE.CylinderGeometry(s * 0.5, s * 0.5, s, 16);
  else if (kind === 'sphere') geo = new THREE.SphereGeometry(s * 0.6, 20, 14);
  else                        geo = new THREE.ConeGeometry(s * 0.6, s, 18);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6c63ff, metalness: 0.2, roughness: 0.6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((i - 1) * s * 1.6, s * 0.75, 0);
  mesh.rotation.y = Math.random() * Math.PI;
  return mesh;
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
  group.clear();
}

function renderTray(count) {
  disposeGroup(trayRoot);
  if (count <= 0) return;

  const w = frameRadius * 0.75, d = frameRadius * 0.4;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, frameRadius * 0.03, d),
    new THREE.MeshStandardMaterial({ color: 0x2a2d3a, metalness: 0.1, roughness: 0.9 }),
  );
  trayRoot.add(base);
  for (let i = 0; i < count; i++) trayRoot.add(makePiece(i));
}

async function loadModel(index) {
  const token = ++modelToken;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(MODEL_PATH(index));
  if (token !== modelToken) return;               // przyszedł nowszy postęp

  disposeGroup(modelRoot);
  modelRoot.add(gltf.scene);
  frameObject(gltf.scene);
  currentModelIndex = index;
  updateCamera();
}

// ── Pętla renderowania ──
// rafId !== null oznacza "pętla chodzi". stop() jest wołane, gdy widok znika
// (patrz stopPcViewer w notes.js) — bez tego WebGL mieliłby klatki w tle po
// przejściu na Notatki albo inny moduł.
function frame(now) {
  if (!running) { rafId = null; return; }
  rafId = requestAnimationFrame(frame);

  const dt = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.1) : 0;
  lastFrameAt = now;

  if (!dragging && now - lastInteractionAt > IDLE_BEFORE_SPIN_MS) {
    yaw += AUTO_SPIN_SPEED * dt;
    updateCamera();
  }
  renderer.render(scene, camera);
}

function startLoop() {
  if (rafId !== null) return;
  running = true;
  lastFrameAt = 0;
  rafId = requestAnimationFrame(frame);
}

function stopLoop() {
  running = false;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

// ── Obrót palcem/myszą ──
// Prosty drag-to-rotate zamiast OrbitControls: potrzebujemy tylko dwóch osi bez
// zoomu i panoramy, a to oszczędza kolejny plik z CDN-u.
function attachDrag(el) {
  el.addEventListener('pointerdown', (e) => {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    lastInteractionAt = performance.now();
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw   -= (e.clientX - lastX) * 0.01;
    pitch += (e.clientY - lastY) * 0.01;
    pitch = Math.max(deg(-80), Math.min(deg(80), pitch));
    lastX = e.clientX; lastY = e.clientY;
    lastInteractionAt = performance.now();
    updateCamera();
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    lastInteractionAt = performance.now();
    try { el.releasePointerCapture(e.pointerId); } catch { /* pointer już puszczony */ }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// Widoczność — trzy niezależne powody, żeby przestać renderować:
// przełączenie podzakładki/strony (kontener znika z układu → IntersectionObserver),
// zminimalizowana karta przeglądarki (visibilitychange) oraz jawne wywołanie
// stopPcViewer() z notes.js. Każdy z nich sam w sobie zatrzymuje pętlę.
let visibilityObserver = null;

function watchVisibility(el) {
  visibilityObserver?.disconnect();
  visibilityObserver = new IntersectionObserver((entries) => {
    const visible = entries.some(e => e.isIntersecting);
    if (visible && document.visibilityState === 'visible') startLoop();
    else stopLoop();
  }, { threshold: 0 });
  visibilityObserver.observe(el);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') stopLoop();
});

function resize() {
  if (!container || !renderer) return;
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/**
 * Pokazuje stan builda w podanym kontenerze.
 * @param {HTMLElement} host  element, w którym ma żyć canvas
 * @param {{modelIndex:number, trayCount:number}} state
 * @returns {Promise<boolean>} false = 3D niedostępne, wywołujący ma pokazać 2D
 */
export async function showPcViewer(host, state) {
  if (!await loadThree()) return false;

  if (!renderer) buildScene();

  if (container !== host) {
    container = host;
    container.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    attachDrag(renderer.domElement);
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    watchVisibility(container);
  }
  resize();

  const index = Math.min(Math.max(state.modelIndex, 1), MODEL_COUNT);
  if (index !== currentModelIndex) {
    try {
      await loadModel(index);
    } catch (err) {
      // Najbardziej prawdopodobny powód: pc-6.glb jeszcze nie ma w repo.
      console.error('[PC 3D] nie udało się wczytać', MODEL_PATH(index), err);
      if (currentModelIndex === null) return false;
    }
  }
  renderTray(state.trayCount);

  lastInteractionAt = performance.now();
  startLoop();
  return true;
}

/** Zatrzymuje pętlę renderowania. Wołane, gdy widok przestaje być widoczny. */
export function stopPcViewer() {
  stopLoop();
}
