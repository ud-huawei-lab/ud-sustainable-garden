import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Camera-informed composition, intentionally approximate rather than survey geometry.
export function createGardenScene(
  host,
  dark,
  markerElements,
  { view = "3d" } = {},
) {
  const plan = view === "2d";
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(dark ? "#030705" : "#f7faf8");
  scene.fog = new THREE.Fog(scene.background, 36, 72);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    "aria-label",
    plan
      ? "Interactive 2D plan of the sustainable garden"
      : "Interactive 3D reconstruction of the sustainable garden",
  );
  renderer.domElement.setAttribute("role", "img");
  const camera = plan
    ? new THREE.OrthographicCamera(-14, 14, 12, -12, 0.1, 120)
    : new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  camera.position.set(...(plan ? [0, 32, 0.01] : [15, 23, 26]));
  if (plan) camera.up.set(0, 0, -1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, plan ? 0 : 0.8, plan ? 0 : 1);
  controls.enableRotate = !plan;
  controls.minZoom = 0.5;
  controls.maxZoom = 3;
  controls.enableDamping = true;
  controls.minDistance = 10;
  controls.maxDistance = 40;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.enablePan = true;
  scene.add(
    new THREE.HemisphereLight(
      dark ? 0xa9c3d4 : 0xe7f4ff,
      0xb4a17f,
      dark ? 1.5 : 2.3,
    ),
  );
  const light = new THREE.DirectionalLight(0xfff1d5, dark ? 2 : 3.2);
  light.position.set(-9, 19, 10);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -16;
  light.shadow.camera.right = 16;
  light.shadow.camera.top = 16;
  light.shadow.camera.bottom = -16;
  light.shadow.normalBias = 0.04;
  scene.add(light);
  const materials = new Map();
  const material = (color, roughness = 0.8, metalness = 0) => {
    const key = [color, roughness, metalness].join();
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({ color, roughness, metalness }),
      );
    return materials.get(key);
  };
  const mesh = (
    geometry,
    color,
    x,
    y,
    z,
    parent = scene,
    roughness = 0.8,
    metalness = 0,
  ) => {
    const item = new THREE.Mesh(
      geometry,
      material(color, roughness, metalness),
    );
    item.position.set(x, y, z);
    item.castShadow = true;
    item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const box = (w, h, d, color, x, y, z, parent = scene) =>
    mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
  const cylinder = (top, bottom, height, color, x, y, z, parent = scene) =>
    mesh(
      new THREE.CylinderGeometry(top, bottom, height, 14),
      color,
      x,
      y,
      z,
      parent,
    );
  const ground = box(21, 0.3, 17, "#d2c1a0", 0, -0.22, 0);
  ground.receiveShadow = true;
  const foundation = box(21.2, 0.13, 17.2, "#b7a78c", 0, -0.43, 0);
  const equipmentPad = box(12.8, 0.16, 7.7, "#b9b7ac", -2.5, 0.02, -3.6);
  const dummy = new THREE.Object3D();
  let seed = 45;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  function tree(x, z, size, potted = false, kind = 0) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    scene.add(group);
    if (potted) {
      cylinder(0.59, 0.39, 0.78, "#f0ede2", 0, 0.43, 0, group);
      cylinder(0.51, 0.51, 0.045, "#66513a", 0, 0.84, 0, group);
    }
    const base = potted ? 0.82 : 0;
    cylinder(
      0.055 * size,
      0.11 * size,
      1.65 * size,
      "#79613e",
      0,
      base + 0.8 * size,
      0,
      group,
    );
    for (let branch = 0; branch < 6; branch++) {
      const angle = (branch * Math.PI) / 3;
      const limb = cylinder(
        0.022 * size,
        0.048 * size,
        0.85 * size,
        "#88734a",
        Math.cos(angle) * 0.18 * size,
        base + 1.25 * size,
        Math.sin(angle) * 0.18 * size,
        group,
      );
      limb.rotation.z = Math.sin(angle) * 0.65;
      limb.rotation.x = Math.cos(angle) * 0.65;
    }
    const leafMaterial = material(
      kind === 1 ? "#668658" : kind === 2 ? "#8b965f" : "#52794d",
    );
    const leaves = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 6, 4),
      leafMaterial,
      230,
    );
    for (let i = 0; i < 230; i++) {
      const theta = random() * Math.PI * 2;
      const vertical = random() * 2 - 1;
      const radius = Math.cbrt(random());
      const spread = Math.sqrt(1 - vertical * vertical);
      dummy.position.set(
        Math.cos(theta) * spread * radius * 0.85 * size,
        base + (1.8 + vertical * radius * 0.7) * size,
        Math.sin(theta) * spread * radius * 0.75 * size,
      );
      dummy.scale.set(
        (0.09 + random() * 0.06) * size,
        (0.035 + random() * 0.035) * size,
        (0.16 + random() * 0.06) * size,
      );
      dummy.rotation.set(random() * 2, random() * 6, random() * 3);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    }
    leaves.castShadow = true;
    group.add(leaves);
    return group;
  }
  // Two humidity extractors, with two potted plants immediately to their right.
  tree(1.2, -3.1, 1.05, true);
  tree(2.8, -3.1, 0.9, true, 1);
  // Equipment cabinets and weather mast.
  for (const x of [-2.8, -1.1]) {
    box(0.72, 3.1, 0.62, "#dddeda", x, 1.68, -4.1);
    box(0.68, 1.55, 0.025, "#c9cbc7", x, 2.05, -3.77);
    box(0.025, 0.15, 0.04, "#66716a", x + 0.24, 1.7, -3.74);
    box(0.9, 0.17, 0.83, "#b8bab5", x, 0.17, -4.1);
  }
  cylinder(0.04, 0.05, 4.1, "#d4d8d4", -4.3, 2.15, -5.5);
  cylinder(0.17, 0.17, 0.09, "#faf9ee", -4.3, 3.6, -5.5);
  box(0.5, 0.05, 0.1, "#575f63", -4.3, 4.22, -5.5);
  for (let i = 0; i < 3; i++)
    mesh(
      new THREE.SphereGeometry(0.08, 10, 8),
      "#656c6a",
      -4.3 + Math.cos(i * 2.09) * 0.27,
      4.28,
      -5.5 + Math.sin(i * 2.09) * 0.27,
    );
  // Ground-mounted solar array to the left of the two humidity extractors.
  const groundSolar = new THREE.Group();
  groundSolar.position.set(-6, 0, -3.6);
  groundSolar.rotation.y = Math.PI / 2;
  scene.add(groundSolar);
  for (let i = 0; i < 4; i++) {
    const panel = box(
      1.8,
      0.07,
      1.28,
      "#294354",
      0,
      0.7,
      -2 + i * 1.34,
      groundSolar,
    );
    panel.rotation.z = -0.18;
    box(0.06, 0.48, 0.06, "#949c9e", -0.65, 0.31, -2 + i * 1.34, groundSolar);
    box(0.06, 0.74, 0.06, "#949c9e", 0.65, 0.44, -2 + i * 1.34, groundSolar);
  }
  // Separate solar parking roof in front, matching the equipment setup's length.
  const solar = new THREE.Group();
  solar.position.set(-2, 0, 3.5);
  scene.add(solar);
  for (const x of [-6.1, 0, 6.1]) {
    box(0.16, 3.25, 0.16, "#939b9d", x, 1.7, -2.4, solar);
    box(0.28, 0.12, 0.35, "#858e90", x, 0.14, -2.4, solar);
    box(0.13, 0.15, 5.4, "#a2aaac", x, 3.23, 0, solar);
  }
  box(12.8, 0.16, 0.16, "#a3aaac", 0, 3.23, -2.4, solar);
  box(12.8, 0.12, 0.12, "#a3aaac", 0, 3.23, 2.4, solar);
  for (let column = 0; column < 9; column++)
    for (let row = 0; row < 3; row++) {
      box(
        1.37,
        0.07,
        1.54,
        "#294354",
        -5.6 + column * 1.4,
        3.38,
        -1.58 + row * 1.58,
        solar,
      );
    }
  // Camera 1 is mounted directly on the right humidity extractor.
  box(0.12, 0.18, 0.18, "#aab2b0", -1.1, 3.3, -3.74);
  box(0.28, 0.16, 0.42, "#e4e9e6", -1.1, 3.48, -3.6);
  box(0.2, 0.1, 0.025, "#253039", -1.1, 3.48, -3.38);
  // Camera 2 is attached near the middle of the parking roof structure.
  box(0.1, 0.12, 0.32, "#aab2b0", 0, 3.04, -2.45, solar);
  box(0.28, 0.16, 0.44, "#e4e9e6", 0, 2.96, -2.65, solar);
  box(0.2, 0.1, 0.025, "#253039", 0, 2.96, -2.88, solar);
  // Ten parking spaces from the sketch, independent of the roof panel count.
  const parking = box(12.8, 0.035, 5.4, "#bcbdb8", -2, 0.03, 3.5);
  for (let boundary = 0; boundary <= 5; boundary++)
    box(0.035, 0.012, 5.35, "#e8e8df", -8.4 + boundary * 2.56, 0.059, 3.5);
  box(12.8, 0.012, 0.035, "#e8e8df", -2, 0.059, 3.5);
  const parkingTextures = [];
  for (let row = 0; row < 2; row++)
    for (let bay = 0; bay < 5; bay++) {
      const label = document.createElement("canvas");
      label.width = 128;
      label.height = 128;
      const context = label.getContext("2d");
      context.fillStyle = "#e8e8df";
      context.font = "500 76px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(String(row === 0 ? 10 - bay : bay + 1), 64, 64);
      const texture = new THREE.CanvasTexture(label);
      parkingTextures.push(texture);
      const paint = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6, 0.6),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        }),
      );
      paint.rotation.x = -Math.PI / 2;
      paint.position.set(-7.12 + bay * 2.56, 0.07, row === 0 ? 1.55 : 5.45);
      scene.add(paint);
    }
  // Collector behind the two pots. Tubing shows routing, not measured pumping.
  const tank = new THREE.Group();
  tank.position.set(2, 0, -5.8);
  scene.add(tank);
  cylinder(0.83, 0.83, 1.9, "#d4d9d5", 0, 1.1, 0, tank);
  cylinder(0.86, 0.86, 0.1, "#b4bdb7", 0, 0.19, 0, tank);
  const tankCap = mesh(
    new THREE.SphereGeometry(0.83, 24, 12),
    "#e1e5e1",
    0,
    2.05,
    0,
    tank,
  );
  tankCap.scale.y = 0.22;
  cylinder(0.16, 0.16, 0.09, "#858f88", 0, 2.27, 0, tank);
  const flowRoutes = [];
  function tube(points) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((point) => new THREE.Vector3(...point)),
      false,
      "centripetal",
    );
    mesh(
      new THREE.TubeGeometry(curve, 64, 0.037, 8, false),
      "#647276",
      0,
      0,
      0,
    );
    const arrows = [0, 1].map(() =>
      mesh(new THREE.ConeGeometry(0.075, 0.2, 8), "#b0c5ce", 0, 0, 0),
    );
    flowRoutes.push({ curve, arrows });
  }
  // Both extractors join the collector inlet.
  tube([
    [-2.8, 0.8, -3.76],
    [-2.8, 0.32, -3.2],
    [-0.3, 0.32, -4.7],
  ]);
  tube([
    [-1.1, 0.8, -3.76],
    [-1.1, 0.32, -3.2],
    [-0.3, 0.32, -4.7],
  ]);
  tube([
    [-0.3, 0.32, -4.7],
    [0.5, 0.32, -5.8],
    [1.17, 0.7, -5.8],
  ]);
  // Tank outlet splits toward the two plant pots.
  tube([
    [2, 0.55, -4.97],
    [2, 0.3, -4.5],
    [1.2, 0.3, -4.1],
    [1.2, 0.88, -3.1],
  ]);
  tube([
    [2, 0.55, -4.97],
    [2, 0.3, -4.5],
    [2.8, 0.3, -4.1],
    [2.8, 0.88, -3.1],
  ]);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const arrowUp = new THREE.Vector3(0, 1, 0);
  const markerPositions = [
    [-4.3, 4.7, -5.5],
    [-1.8, 3.7, -4.1],
    [2.0, 3.1, -3.1],
    [2, 2.6, -5.8],
    [-1.1, 4.1, -3.6],
    [-2, 3.5, 0.65],
  ];
  const vector = new THREE.Vector3();
  const solidSurfaces = new Set([
    ground.material,
    foundation.material,
    equipmentPad.material,
    parking.material,
  ]);
  const labelSizes = markerElements.map((element) => ({
    width: element?.offsetWidth || 120,
    height: element?.offsetHeight || 42,
  }));
  let frame;
  let disposed = false;
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height);
    if (plan) {
      const halfHeight = Math.max(11, 13 / aspect);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
    } else {
      camera.aspect = aspect;
      camera.zoom = Math.min(1, aspect * 1.15);
    }
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function render() {
    if (disposed) return;
    controls.update();
    const flowTime = performance.now() / 1000;
    flowRoutes.forEach(({ curve, arrows }) =>
      arrows.forEach((arrow, index) => {
        const progress = reducedMotion
          ? 0.3 + index * 0.4
          : (flowTime * 0.09 + index * 0.5) % 1;
        arrow.position.copy(curve.getPointAt(progress));
        arrow.quaternion.setFromUnitVectors(
          arrowUp,
          curve.getTangentAt(progress).normalize(),
        );
      }),
    );
    renderer.render(scene, camera);
    const width = host.clientWidth,
      height = host.clientHeight;
    const placedLabels = [];
    markerPositions.forEach((position, index) => {
      const element = markerElements[index];
      if (!element) return;
      vector.set(...position).project(camera);
      const labelOffset = index === 4 ? -65 : index === 5 ? 55 : 0;
      const size = labelSizes[index];
      const left = THREE.MathUtils.clamp(
        (vector.x * 0.5 + 0.5) * width + labelOffset - size.width / 2,
        8,
        Math.max(8, width - size.width - 8),
      );
      let top = (-vector.y * 0.5 + 0.5) * height - size.height;
      // Compact projected labels move upward when their equipment is close together.
      for (let pass = 0; pass < markerPositions.length; pass++) {
        const collision = placedLabels.find(
          (other) =>
            left < other.right + 6 &&
            left + size.width > other.left - 6 &&
            top < other.bottom + 6 &&
            top + size.height > other.top - 6,
        );
        if (!collision) break;
        top = collision.top - size.height - 6;
      }
      element.style.transform = `translate(${left}px,${top}px)`;
      placedLabels.push({
        left,
        right: left + size.width,
        top,
        bottom: top + size.height,
      });
      element.style.visibility =
        vector.z < 1 && Math.abs(vector.x) < 1.15 && Math.abs(vector.y) < 1.15
          ? "visible"
          : "hidden";
    });
    frame = requestAnimationFrame(render);
  }
  render();
  return {
    setWireframe(enabled) {
      // Change model materials without rebuilding geometry or resetting the view.
      materials.forEach((material) => {
        material.wireframe = enabled && !solidSurfaces.has(material);
      });
    },
    orbit(delta) {
      if (plan) return;
      camera.position
        .sub(controls.target)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), delta)
        .add(controls.target);
      controls.update();
    },
    zoom(factor) {
      if (plan) {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom / factor, 0.5, 3);
        camera.updateProjectionMatrix();
        return;
      }
      const offset = camera.position.clone().sub(controls.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, 10, 40));
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    reset() {
      camera.position.set(...(plan ? [0, 32, 0.01] : [15, 23, 26]));
      controls.target.set(0, plan ? 0 : 0.8, plan ? 0 : 1);
      if (plan) {
        camera.zoom = 1;
        camera.updateProjectionMatrix();
      }
      controls.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => object.geometry?.dispose());
      materials.forEach((m) => m.dispose());
      parkingTextures.forEach((texture) => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
