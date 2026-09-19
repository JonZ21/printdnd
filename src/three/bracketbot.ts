import * as THREE from "three";
import {
  faceplate,
  gripperPad,
  hardware,
  lensGlass,
  lightBar,
  printedWhite,
} from "./materials";

/**
 * The robot, built from primitives to match the photograph.
 *
 * Only the upper body exists here — head, neck, shoulders, arms, grippers. The photo
 * stops at the waist, so anything below it would be invention; the scene lets the base
 * fall into shadow instead.
 *
 * Metres throughout. Origin sits at the bottom of the visible torso.
 */

const HEAD = { w: 0.248, h: 0.112, d: 0.094 };
const FACE = { w: 0.212, h: 0.078, d: 0.016 };
const LENS = { radius: 0.018, offset: 0.052 };
const BAR = { w: 0.088, h: 0.016 };
const NECK = { w: 0.128, d: 0.1, h: 0.44, radius: 0.038 };
const DRUM = { radius: 0.052, h: 0.16, offset: 0.098, centreY: 0.235 };
const ARM = { upper: 0.155, fore: 0.165, wrist: 0.046, jaw: 0.08, thickness: 0.048 };

/** Seven rotational joints per arm, matching the seven non-gripper channels recorded. */
export const JOINTS_PER_ARM = 7;

export interface ArmRig {
  /** Index 0 is the shoulder, index 6 the last wrist joint. */
  joints: THREE.Object3D[];
  /** Both jaws, driven together by the recorded gripper channel. */
  jawLeft: THREE.Object3D;
  jawRight: THREE.Object3D;
}

export interface RobotRig {
  root: THREE.Group;
  /** Carries the IMU-recorded body attitude. */
  body: THREE.Group;
  head: THREE.Object3D;
  arms: { left: ArmRig; right: ArmRig };
}

/** A pill / stadium outline — the head's defining silhouette. */
function stadiumShape(width: number, height: number) {
  const r = height / 2;
  const straight = Math.max(width / 2 - r, 0.0001);
  const shape = new THREE.Shape();
  shape.moveTo(-straight, -r);
  shape.lineTo(straight, -r);
  shape.absarc(straight, 0, r, -Math.PI / 2, Math.PI / 2, false);
  shape.lineTo(-straight, r);
  shape.absarc(-straight, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);
  return shape;
}

function roundedRectShape(width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  const x = width / 2;
  const y = height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -y);
  shape.lineTo(x - r, -y);
  shape.quadraticCurveTo(x, -y, x, -y + r);
  shape.lineTo(x, y - r);
  shape.quadraticCurveTo(x, y, x - r, y);
  shape.lineTo(-x + r, y);
  shape.quadraticCurveTo(-x, y, -x, y - r);
  shape.lineTo(-x, -y + r);
  shape.quadraticCurveTo(-x, -y, -x + r, -y);
  return shape;
}

function extrude(shape: THREE.Shape, depth: number, bevel: number, segments = 24) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: segments,
  });
  geometry.translate(0, 0, -(depth - bevel * 2) / 2);
  geometry.computeVertexNormals();
  return geometry;
}

/** A vertical prism with rounded corners in plan — the neck and the arm segments. */
function roundedPrism(width: number, depth: number, height: number, radius: number) {
  const geometry = extrude(roundedRectShape(width, depth, radius), height, 0.006, 16);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function buildHead(): THREE.Group {
  const head = new THREE.Group();

  const shell = new THREE.Mesh(
    extrude(stadiumShape(HEAD.w, HEAD.h), HEAD.d, 0.012, 32),
    printedWhite({ amplitude: 0.75 }),
  );
  shell.castShadow = true;
  head.add(shell);

  // The black oval panel, recessed into the front face.
  const panel = new THREE.Mesh(
    extrude(stadiumShape(FACE.w, FACE.h), FACE.d, 0.004, 32),
    faceplate(),
  );
  panel.position.z = HEAD.d / 2 - FACE.d / 2 + 0.004;
  head.add(panel);

  // Stereo pair. Slightly proud of the panel so they catch their own highlight.
  const glass = lensGlass();
  const barrel = hardware();
  for (const side of [-1, 1]) {
    const housing = new THREE.Mesh(
      new THREE.CylinderGeometry(LENS.radius, LENS.radius, 0.014, 28),
      barrel,
    );
    housing.rotation.x = Math.PI / 2;
    housing.position.set(side * LENS.offset, 0, panel.position.z + FACE.d / 2);
    head.add(housing);

    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(LENS.radius * 0.82, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2),
      glass,
    );
    lens.rotation.x = Math.PI / 2;
    lens.position.set(side * LENS.offset, 0, panel.position.z + FACE.d / 2 + 0.004);
    head.add(lens);
  }

  return head;
}

function buildGripper(material: THREE.Material): {
  group: THREE.Group;
  jawLeft: THREE.Object3D;
  jawRight: THREE.Object3D;
} {
  const group = new THREE.Group();

  const palm = new THREE.Mesh(roundedPrism(0.056, 0.042, 0.044, 0.013), material);
  palm.position.y = -0.022;
  group.add(palm);

  const jaws: THREE.Object3D[] = [];
  const pad = gripperPad();

  for (const side of [-1, 1]) {
    const pivot = new THREE.Object3D();
    pivot.position.set(side * 0.017, -0.044, 0);
    group.add(pivot);

    // Tapered finger — wide at the knuckle, narrow at the tip, as in the wrist-cam view.
    // Wide at the knuckle (top), narrow at the tip. Flipped, the jaws splay outward and
    // the whole hand reads as a tripod.
    const finger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.006, ARM.jaw, 4, 1),
      material,
    );
    finger.rotation.y = Math.PI / 4;
    finger.position.y = -ARM.jaw / 2;
    finger.scale.z = 1.5;
    finger.castShadow = true;
    pivot.add(finger);

    // The black grip pad on the inner face.
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.005, ARM.jaw * 0.66, 0.026), pad);
    grip.position.set(side * -0.008, -ARM.jaw * 0.5, 0);
    pivot.add(grip);

    jaws.push(pivot);
  }

  const [jawLeft, jawRight] = jaws;
  if (!jawLeft || !jawRight) throw new Error("gripper jaws failed to build");
  return { group, jawLeft, jawRight };
}

function buildArm(side: -1 | 1): { group: THREE.Group; rig: ArmRig } {
  const group = new THREE.Group();
  const white = printedWhite({ amplitude: 0.85 });
  const collar = hardware();

  // The shoulder drum the whole arm hangs off. Sits slightly behind the column so the
  // arms read as coming forward past it rather than out of its side.
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(DRUM.radius, DRUM.radius, DRUM.h, 36, 1),
    white,
  );
  drum.position.set(0, DRUM.centreY, -0.014);
  drum.castShadow = true;
  group.add(drum);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(DRUM.radius, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    white,
  );
  cap.position.set(0, DRUM.centreY + DRUM.h / 2, -0.014);
  cap.scale.y = 0.34;
  group.add(cap);

  const joints: THREE.Object3D[] = [];
  let parent: THREE.Object3D = group;

  const attach = (position: THREE.Vector3) => {
    const pivot = new THREE.Object3D();
    pivot.position.copy(position);
    parent.add(pivot);
    parent = pivot;
    joints.push(pivot);
    return pivot;
  };

  // Narrow enough to read as a joint band rather than a black block stuck on the arm.
  const collarAt = (pivot: THREE.Object3D, radius: number) => {
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, 0.022, 28),
      collar,
    );
    ring.rotation.z = Math.PI / 2;
    pivot.add(ring);
  };

  // 0 — shoulder pitch, swinging the whole arm forward off the drum.
  const shoulder = attach(
    new THREE.Vector3(side * DRUM.radius * 0.24, DRUM.centreY + DRUM.h * 0.3, 0.014),
  );
  collarAt(shoulder, 0.024);
  // 1 — shoulder roll, splaying the arm out from the body.
  attach(new THREE.Vector3(0, 0, 0));
  // 2 — upper arm twist.
  attach(new THREE.Vector3(0, 0, 0));

  const upper = new THREE.Mesh(
    roundedPrism(ARM.thickness, ARM.thickness, ARM.upper, 0.018),
    white,
  );
  upper.position.y = -ARM.upper / 2;
  upper.castShadow = true;
  parent.add(upper);

  // A small camera module sits on the upper arm, as in the photo.
  const armCam = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.019, 0.011), collar);
  armCam.position.set(0, -ARM.upper * 0.24, ARM.thickness / 2 + 0.005);
  parent.add(armCam);
  const armCamLens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 16),
    lensGlass(),
  );
  armCamLens.rotation.x = Math.PI / 2;
  armCamLens.position.set(0, -ARM.upper * 0.24, ARM.thickness / 2 + 0.014);
  parent.add(armCamLens);

  // 3 — elbow.
  const elbow = attach(new THREE.Vector3(0, -ARM.upper, 0));
  collarAt(elbow, 0.026);

  const fore = new THREE.Mesh(
    roundedPrism(ARM.thickness * 0.88, ARM.thickness * 0.88, ARM.fore, 0.016),
    white,
  );
  fore.position.y = -ARM.fore / 2;
  fore.castShadow = true;
  parent.add(fore);

  // 4 — forearm roll, 5 — wrist pitch, 6 — wrist yaw.
  attach(new THREE.Vector3(0, -ARM.fore, 0));
  const wristPitch = attach(new THREE.Vector3(0, 0, 0));
  collarAt(wristPitch, 0.022);
  attach(new THREE.Vector3(0, -ARM.wrist, 0));

  const gripper = buildGripper(white);
  parent.add(gripper.group);

  if (joints.length !== JOINTS_PER_ARM) {
    throw new Error(`expected ${JOINTS_PER_ARM} joints, built ${joints.length}`);
  }

  return {
    group,
    rig: { joints, jawLeft: gripper.jawLeft, jawRight: gripper.jawRight },
  };
}

function buildCable(): THREE.Mesh {
  // One loose cable run down the side of the neck — the real machine is full of them,
  // and a single sagging curve does more for believability than a dozen straight ones.
  // Kept round the back so it reads as a cable catching a rim light, not as a seam
  // down the front of the torso.
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.05, NECK.h * 0.9, -0.03),
    new THREE.Vector3(0.068, NECK.h * 0.68, -0.052),
    new THREE.Vector3(0.064, NECK.h * 0.42, -0.05),
    new THREE.Vector3(0.052, NECK.h * 0.16, -0.04),
    new THREE.Vector3(0.036, 0.02, -0.022),
  ]);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 40, 0.0045, 10, false),
    new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.7, metalness: 0.1 }),
  );
}

export function buildBracketBot(): RobotRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const white = printedWhite();

  const neck = new THREE.Mesh(
    roundedPrism(NECK.w, NECK.d, NECK.h, NECK.radius),
    white,
  );
  neck.position.y = NECK.h / 2;
  neck.castShadow = true;
  body.add(neck);

  body.add(buildCable());

  // The cyan bar on the front of the neck, below the head. It sits proud of the surface
  // and clear of the head's overhang — tucked underneath, the chin occludes its middle
  // and it reads as two headlights instead of one strip.
  const bar = new THREE.Mesh(
    extrude(roundedRectShape(BAR.w, BAR.h, BAR.h / 2), 0.014, 0.003, 12),
    lightBar(),
  );
  bar.position.set(0, NECK.h - 0.056, NECK.d / 2 + 0.004);
  body.add(bar);

  const head = buildHead();
  // Overlapping the neck slightly, so no daylight shows under the chin.
  head.position.set(0, NECK.h + HEAD.h / 2 - 0.012, 0.004);
  // A slight downward tilt — it is looking at a print bed, not at the horizon.
  head.rotation.x = -0.11;
  body.add(head);

  const left = buildArm(-1);
  left.group.position.set(-DRUM.offset, 0, 0);
  body.add(left.group);

  const right = buildArm(1);
  right.group.position.set(DRUM.offset, 0, 0);
  body.add(right.group);

  return { root, body, head, arms: { left: left.rig, right: right.rig } };
}

export const ROBOT_BOUNDS = {
  topY: NECK.h + HEAD.h + 0.04,
  halfWidth: DRUM.offset + DRUM.radius + ARM.thickness,
};
