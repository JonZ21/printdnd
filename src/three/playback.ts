import * as THREE from "three";
import { JOINTS_PER_ARM, type ArmRig, type RobotRig } from "./bracketbot";

/**
 * Replays a recorded teleop episode onto the rig.
 *
 * Every number here comes out of public/data/episode.json, baked from ep000000 of the
 * team's own "lift up the printer bed" dataset. The arms move because somebody actually
 * drove them into a printer; the body leans because that is what the IMU recorded while
 * the balancer held itself up. No keyframes were authored.
 *
 * Two display gains are applied, and they are the only liberties taken:
 *  - JOINT_GAIN, because the recorded motion is a careful 20cm reach and reads as almost
 *    nothing at the scale the robot appears on screen.
 *  - BODY_GAIN, which damps the IMU trace; played 1:1 the robot appears to topple.
 * Both scale the real signal. Neither invents one.
 */

// The recorded joints move between 1 and 12 degrees each across the episode -- a careful
// reach, which at the size the robot appears on screen is close to invisible. The gain
// scales that real signal up until it reads.
const JOINT_GAIN = 4.5;
const BODY_GAIN = 0.22;

const GRIP_OPEN = 0.22;
const GRIP_CLOSED = 0.012;

export interface Episode {
  source: string;
  episode: string;
  uid: string;
  status: string;
  duration: number;
  fps: number;
  frames: number;
  arm_left: { rest: number[]; joints: number[][] };
  arm_right: { rest: number[]; joints: number[][] };
  grip_left: number[];
  grip_right: number[];
  roll: number[];
  pitch: number[];
  yaw: number[];
}

/**
 * Which local axis each joint in the chain turns about.
 * 0 shoulder pitch, 1 shoulder roll, 2 upper-arm twist, 3 elbow, 4 forearm twist,
 * 5 wrist pitch, 6 wrist roll.
 */
const JOINT_AXES = ["x", "z", "y", "x", "y", "x", "z"] as const;

/**
 * Resting stance: upper arms swung forward off the shoulders, elbows bent so the
 * forearms drop, grippers hanging in front at about the height of a print bed.
 */
function neutralPose(side: -1 | 1): number[] {
  return [-1.05, side * 0.045, 0, 0.7, 0, -0.16, 0];
}

export async function loadEpisode(url: string): Promise<Episode> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`episode fetch failed: ${response.status}`);
  return (await response.json()) as Episode;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function sampleTrack(track: number[], frame: number): number {
  const i = Math.floor(frame);
  const a = track[i] ?? 0;
  const b = track[i + 1] ?? a;
  return lerp(a, b, frame - i);
}

function sampleJoints(
  arm: { rest: number[]; joints: number[][] },
  frame: number,
  out: number[],
): void {
  const i = Math.floor(frame);
  const a = arm.joints[i] ?? arm.rest;
  const b = arm.joints[i + 1] ?? a;
  const mix = frame - i;
  for (let j = 0; j < JOINTS_PER_ARM; j += 1) {
    const rest = arm.rest[j] ?? 0;
    out[j] = lerp(a[j] ?? rest, b[j] ?? rest, mix) - rest;
  }
}

function applyArm(rig: ArmRig, side: -1 | 1, deltas: number[], grip: number) {
  const neutral = neutralPose(side);
  for (let j = 0; j < JOINTS_PER_ARM; j += 1) {
    const pivot = rig.joints[j];
    if (!pivot) continue;
    const axis = JOINT_AXES[j] ?? "x";
    pivot.rotation[axis] = (neutral[j] ?? 0) + (deltas[j] ?? 0) * JOINT_GAIN;
  }
  const angle = lerp(GRIP_OPEN, GRIP_CLOSED, THREE.MathUtils.clamp(grip, 0, 1));
  rig.jawLeft.rotation.z = -angle;
  rig.jawRight.rotation.z = angle;
}

export class EpisodePlayer {
  private readonly leftDeltas = new Array<number>(JOINTS_PER_ARM).fill(0);
  private readonly rightDeltas = new Array<number>(JOINTS_PER_ARM).fill(0);

  /** Progress through the episode, 0..1. */
  progress = 0;

  constructor(
    private readonly rig: RobotRig,
    private readonly episode: Episode,
  ) {}

  get frameCount() {
    return this.episode.frames;
  }

  get currentFrame() {
    return Math.round(this.progress * (this.episode.frames - 1));
  }

  get currentTime() {
    return this.progress * this.episode.duration;
  }

  /** `idle` drifts the body using the recorded attitude trace when nothing is scrolling. */
  update(idleSeconds: number) {
    const last = this.episode.frames - 1;
    const frame = THREE.MathUtils.clamp(this.progress, 0, 1) * last;

    sampleJoints(this.episode.arm_left, frame, this.leftDeltas);
    sampleJoints(this.episode.arm_right, frame, this.rightDeltas);

    applyArm(this.rig.arms.left, -1, this.leftDeltas, sampleTrack(this.episode.grip_left, frame));
    applyArm(this.rig.arms.right, 1, this.rightDeltas, sampleTrack(this.episode.grip_right, frame));

    // Body attitude from the IMU, plus a slow wander through the same trace so the robot
    // is never perfectly still even when the page is not moving. A balancer never is.
    const driftFrame = ((idleSeconds * 4) % last + last) % last;
    const drift = 0.35;
    const pitch = sampleTrack(this.episode.pitch, frame) + sampleTrack(this.episode.pitch, driftFrame) * drift;
    const roll = sampleTrack(this.episode.roll, frame) + sampleTrack(this.episode.roll, driftFrame) * drift;
    const yaw = sampleTrack(this.episode.yaw, frame);

    this.rig.body.rotation.x = pitch * BODY_GAIN;
    this.rig.body.rotation.z = roll * BODY_GAIN;
    this.rig.body.rotation.y = yaw * BODY_GAIN * 0.5;
  }
}
