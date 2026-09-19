import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import { buildBracketBot, ROBOT_BOUNDS } from "./bracketbot";
import { disposeTree, PALETTE } from "./materials";
import { EpisodePlayer, loadEpisode } from "./playback";

/**
 * Sets up the renderer, lights the robot like a dark workshop, and runs the frame loop.
 *
 * SPLINE SWAP POINT — if a Spline scene ever replaces this hand-built model, everything
 * below can go. Keep `mountRobot`'s signature: the page only ever calls `setProgress`,
 * reads `onFrame`, and calls `dispose`.
 */

export interface RobotHandle {
  /** 0..1 through the recorded episode. */
  setProgress(value: number): void;
  /** Called whenever the displayed frame changes, for the telemetry readout. */
  onFrame(callback: (frame: number, total: number, seconds: number) => void): void;
  dispose(): void;
}

export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl")),
    );
  } catch {
    return false;
  }
}

/** A dark room with two bright cards, used for reflections rather than ambient fill. */
function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x050506);

  const card = (color: number, intensity: number, position: THREE.Vector3, scale: THREE.Vector3) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) }),
    );
    mesh.position.copy(position);
    mesh.scale.copy(scale);
    mesh.lookAt(0, 0, 0);
    envScene.add(mesh);
  };

  card(0xbfd8ff, 3.4, new THREE.Vector3(-3, 3.4, 2.2), new THREE.Vector3(5, 3.4, 1));
  card(0xff7a3c, 0.95, new THREE.Vector3(3.2, -1.1, -2.4), new THREE.Vector3(4.4, 3, 1));
  card(PALETTE.beam, 0.5, new THREE.Vector3(0.4, -1.8, 2.8), new THREE.Vector3(2, 1.2, 1));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  envScene.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  });
  return target.texture;
}

export async function mountRobot(canvas: HTMLCanvasElement): Promise<RobotHandle> {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lightweight = window.matchMedia("(max-width: 860px)").matches;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  // Transparent clear. Setting an opaque clear to the page colour does not work: it goes
  // through ACES tone mapping and comes out lighter, painting a visible grey rectangle.
  // The canvas edge is feathered in CSS instead.
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.environment = buildEnvironment(renderer);
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0.5, 0.42, 1.46);
  camera.lookAt(0, ROBOT_BOUNDS.topY * 0.5, 0);

  // Cool key from upper left, warm rim from lower right — the palette's two poles.
  const key = new THREE.DirectionalLight(0xdce9ff, 2.7);
  key.position.set(-1.6, 2.1, 1.5);
  scene.add(key);

  // Warm rim, kept restrained — pushed harder it tints the whole shell orange and the
  // robot stops reading as white plastic.
  const rim = new THREE.DirectionalLight(0xff7038, 1.25);
  rim.position.set(2.2, -0.4, -1.4);
  scene.add(rim);

  const fill = new THREE.DirectionalLight(0x9fb4cc, 0.5);
  fill.position.set(1.1, 0.6, 1.9);
  scene.add(fill);

  scene.add(new THREE.AmbientLight(0x2a3340, 0.6));

  const rig = buildBracketBot();
  const pivot = new THREE.Group();
  pivot.add(rig.root);
  scene.add(pivot);

  const episode = await loadEpisode(`${import.meta.env.BASE_URL}data/episode.json`);
  const player = new EpisodePlayer(rig, episode);

  let composer: EffectComposer | null = null;
  if (!lightweight) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.42, 0.75, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    // Pull back on narrow viewports so the arms stay inside the frame.
    camera.fov = width / height < 0.9 ? 44 : 34;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
  };

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // Pointer parallax, damped, and clamped hard so the robot never swings away.
  const pointer = { x: 0, y: 0 };
  const smoothed = { x: 0, y: 0 };
  const onPointerMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  };
  if (!reducedMotion) window.addEventListener("pointermove", onPointerMove, { passive: true });

  let frameCallback: ((frame: number, total: number, seconds: number) => void) | null = null;
  let lastReportedFrame = -1;
  let targetProgress = reducedMotion ? 0.42 : 0;
  let shownProgress = targetProgress;

  let running = true;
  let visible = true;
  let animationId = 0;
  const clock = new THREE.Clock();

  const render = () => {
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(clock.getDelta(), 0.1);

    shownProgress += (targetProgress - shownProgress) * Math.min(delta * 6, 1);

    smoothed.x += (pointer.x - smoothed.x) * Math.min(delta * 3, 1);
    smoothed.y += (pointer.y - smoothed.y) * Math.min(delta * 3, 1);
    pivot.rotation.y = smoothed.x * 0.21;
    pivot.rotation.x = smoothed.y * 0.07;

    player.progress = shownProgress;
    player.update(reducedMotion ? 0 : elapsed);

    if (composer) composer.render();
    else renderer.render(scene, camera);

    if (frameCallback && player.currentFrame !== lastReportedFrame) {
      lastReportedFrame = player.currentFrame;
      frameCallback(player.currentFrame, player.frameCount, player.currentTime);
    }
  };

  const loop = () => {
    if (!running) return;
    animationId = requestAnimationFrame(loop);
    if (!visible) return;
    render();
  };

  // Don't burn frames on a canvas nobody can see.
  const intersection = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible) clock.getDelta();
    },
    { rootMargin: "120px" },
  );
  intersection.observe(canvas);

  const onVisibility = () => {
    if (document.hidden) visible = false;
    else visible = true;
  };
  document.addEventListener("visibilitychange", onVisibility);

  if (reducedMotion) {
    // One static frame, no loop at all.
    player.progress = targetProgress;
    player.update(0);
    render();
  } else {
    loop();
  }

  return {
    setProgress(value: number) {
      if (reducedMotion) return;
      targetProgress = THREE.MathUtils.clamp(value, 0, 1);
    },
    onFrame(callback) {
      frameCallback = callback;
      callback(player.currentFrame, player.frameCount, player.currentTime);
    },
    dispose() {
      running = false;
      cancelAnimationFrame(animationId);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onPointerMove);
      disposeTree(scene);
      composer?.dispose();
      renderer.dispose();
    },
  };
}
