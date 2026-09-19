import * as THREE from "three";

/**
 * Materials for the robot.
 *
 * The one that matters is the printed white plastic. The real machine is almost entirely
 * FDM parts with clearly visible layer lines, so rather than fake that with a UV-mapped
 * texture -- which would stretch differently on every part -- the banding is computed
 * from world-space height in the shader. Layer pitch then stays constant across the
 * whole robot no matter how each piece was built or scaled.
 */

// Metres between layers. A real print is around 0.2mm, which is far below a pixel at the
// size the robot renders, so the pitch is exaggerated until the banding actually reads.
const LAYER_PITCH = 0.0027;

export const PALETTE = {
  shell: 0xf2f0eb,
  shellShadowed: 0xe4e1da,
  faceplate: 0x0b0b0d,
  pad: 0x141416,
  beam: 0x7fe7ff,
} as const;

/** Tracks materials that animate, so the scene can update them each frame. */
export const beamMaterials: THREE.MeshStandardMaterial[] = [];

function addLayerLines(material: THREE.Material, amplitude = 1) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLayerPitch = { value: LAYER_PITCH };
    shader.uniforms.uLayerAmp = { value: amplitude };

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vLayerWorldPos;`,
      )
      .replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
         vLayerWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vLayerWorldPos;
         uniform float uLayerPitch;
         uniform float uLayerAmp;`,
      )
      // Tilt the shading normal along world Y in step with the band, which is what
      // actually catches the light and reads as a ridge rather than a stripe.
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
         {
           float phase = vLayerWorldPos.y * 6.2831853 / uLayerPitch;
           float slope = cos(phase) * 0.15 * uLayerAmp;
           vec3 tilt = vec3(0.0, slope, 0.0);
           tilt -= normal * dot(normal, tilt);
           normal = normalize(normal + tilt);
         }`,
      )
      // A little roughness banding on top: the top of each bead is burnished, the valley
      // between beads stays matte.
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
         {
           float phase = vLayerWorldPos.y * 6.2831853 / uLayerPitch;
           roughnessFactor *= 1.0 + sin(phase) * 0.17 * uLayerAmp;
           roughnessFactor = clamp(roughnessFactor, 0.04, 1.0);
         }`,
      );
  };
  // Distinct key so these don't share a compiled program with unbanded materials.
  material.customProgramCacheKey = () => `layers-${amplitude}`;
}

/** Matte white FDM plastic — the bulk of the robot. */
export function printedWhite(options: { amplitude?: number; color?: number } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? PALETTE.shell,
    roughness: 0.62,
    metalness: 0.0,
  });
  addLayerLines(material, options.amplitude ?? 1);
  return material;
}

/** The glossy black oval the stereo cameras sit behind. */
export function faceplate() {
  return new THREE.MeshPhysicalMaterial({
    color: PALETTE.faceplate,
    roughness: 0.14,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
  });
}

/** Camera glass — nearly black, but it catches a highlight and that sells it. */
export function lensGlass() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x05070a,
    roughness: 0.08,
    metalness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
  });
}

/** The rubbery pads on the inner faces of the gripper jaws. */
export function gripperPad() {
  return new THREE.MeshStandardMaterial({
    color: PALETTE.pad,
    roughness: 0.94,
    metalness: 0.0,
  });
}

/**
 * Joint collars, camera housings, fasteners. Kept mid-grey and only lightly metallic —
 * darker than this and every one of them reads as a black blob stuck on a white arm.
 */
export function hardware() {
  return new THREE.MeshStandardMaterial({
    color: 0x3c3c43,
    roughness: 0.5,
    metalness: 0.35,
  });
}

/**
 * The cyan light bar under the head. Emissive well above 1.0 so it crosses the bloom
 * threshold while nothing else does.
 */
export function lightBar() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x0a1418,
    emissive: new THREE.Color(PALETTE.beam),
    // High enough to cross the bloom threshold, low enough that it stays cyan instead of
    // clipping to a white flare.
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0.0,
  });
  beamMaterials.push(material);
  return material;
}

/** Disposes every material and geometry under a root object. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const material = child.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  });
}
