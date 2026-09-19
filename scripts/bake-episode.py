#!/usr/bin/env python3
"""Bake one recorded teleop episode into a compact JSON the website can replay.

Source is the team's own dataset: quest_teleop / "lift up the printer bed", ep000000.
Everything the robot does on the site comes out of this file -- arm joint angles, gripper
open/close and body lean are recorded values, not authored keyframes.

Channels are sampled at different rates (arms ~65Hz, IMU ~120Hz), so each one is
resampled onto a shared 30Hz timeline spanning the episode, then quantised to keep the
payload small.

Usage:  python3 scripts/bake-episode.py [path/to/episode.npz]
Output: public/data/episode.json
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np

REPO = Path(__file__).resolve().parent.parent
DEFAULT_NPZ = Path.home() / (
    "Downloads/bracketbot/dataset_backups/lift_up_the_printer_bed/"
    "1789818909_35018_4b1d9b82/"
    "datasets__quest_teleop__lift up the printer bed__episodes__ep000000_6d3b9ded_0.npz"
)
OUT = REPO / "public" / "data" / "episode.json"

FPS = 30
JOINT_DECIMALS = 4
SCALAR_DECIMALS = 3


def seconds(timestamps: np.ndarray, t0: np.int64) -> np.ndarray:
    """datetime64[ns] column -> float seconds since episode start."""
    return (timestamps.astype("datetime64[ns]").astype(np.int64) - t0) / 1e9


def resample(src_t: np.ndarray, src_v: np.ndarray, dst_t: np.ndarray) -> np.ndarray:
    """Linearly resample a (n,) or (n, d) signal onto dst_t."""
    if src_v.ndim == 1:
        return np.interp(dst_t, src_t, src_v)
    return np.column_stack(
        [np.interp(dst_t, src_t, src_v[:, i]) for i in range(src_v.shape[1])]
    )


def unwrap_rpy(rpy: np.ndarray) -> np.ndarray:
    """The IMU reports absolute angles that wrap; unwrap then re-centre on the median.

    Raw pitch sits around 5.4 rad rather than 0, so what matters for the site is the
    deviation from the episode's resting attitude, which is what this returns.
    """
    unwrapped = np.unwrap(rpy, axis=0)
    return unwrapped - np.median(unwrapped, axis=0)


def q(values: np.ndarray, decimals: int) -> list:
    """Round and convert to plain Python floats so json doesn't emit 0.10000000149."""
    return np.round(values, decimals).astype(float).tolist()


def main() -> int:
    npz_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_NPZ
    if not npz_path.exists():
        print(f"episode not found: {npz_path}", file=sys.stderr)
        print("pass the .npz path as the first argument", file=sys.stderr)
        return 1

    data = np.load(npz_path, allow_pickle=True)
    t0 = np.int64(data["meta_start_time_ns"])
    duration = (np.int64(data["meta_end_time_ns"]) - t0) / 1e9
    frames = int(round(duration * FPS))
    timeline = np.linspace(0.0, duration, frames)

    out: dict = {
        "source": "quest_teleop/lift up the printer bed",
        "episode": "ep000000",
        "uid": "6d3b9ded",
        "status": str(data["meta_status"]),
        "duration": round(float(duration), 3),
        "fps": FPS,
        "frames": frames,
    }

    # Arm joints. 8 channels per arm -- 7 arm joints plus the gripper axis.
    for side in ("left", "right"):
        state = data[f"arm_{side}_state"]
        target = data[f"arm_{side}_target"]

        joints = resample(
            seconds(state["timestamp"], t0), state["pos"].astype(np.float64), timeline
        )
        # Hold each joint's episode-start value as the rest pose so the site can blend
        # between "parked" and "working" without inventing a pose.
        out[f"arm_{side}"] = {
            "rest": q(joints[0], JOINT_DECIMALS),
            "joints": [q(frame, JOINT_DECIMALS) for frame in joints],
        }

        grip = resample(
            seconds(target["timestamp"], t0), target["grip"].astype(np.float64), timeline
        )
        out[f"grip_{side}"] = q(np.clip(grip, 0.0, 1.0), SCALAR_DECIMALS)

    # Body attitude from the IMU -- this is the balancer actually holding itself up.
    imu = data["imu_orientation"]
    rpy = resample(
        seconds(imu["timestamp"], t0), unwrap_rpy(imu["rpy"].astype(np.float64)), timeline
    )
    out["roll"] = q(rpy[:, 0], JOINT_DECIMALS)
    out["pitch"] = q(rpy[:, 1], JOINT_DECIMALS)
    out["yaw"] = q(rpy[:, 2], JOINT_DECIMALS)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))

    size_kb = OUT.stat().st_size / 1024
    pitch_span = math.degrees(float(rpy[:, 1].max() - rpy[:, 1].min()))
    print(f"wrote {OUT.relative_to(REPO)}  {size_kb:.1f}KB")
    print(f"  {frames} frames @ {FPS}Hz over {duration:.1f}s")
    print(f"  pitch span {pitch_span:.1f} deg")
    for side in ("left", "right"):
        g = np.array(out[f"grip_{side}"])
        print(f"  grip {side}: {g.min():.2f} -> {g.max():.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
