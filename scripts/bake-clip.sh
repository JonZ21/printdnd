#!/usr/bin/env bash
# Encode the project's footage into web-ready clips.
#
# Four clips:
#
#   vla        the robot clearing the printer on its own at normal speed, shot from
#              across the table. No teleoperation. This is the hero -- it is the only
#              clip that shows the whole thing actually working.
#   timelapse  the build on the hackathon floor, compressed.
#   pickup     the gripper closing on a finished part, lifting it off the plate and
#              setting it down.
#   wrist-cam  the left arm camera from ep000000 of the team's own
#              quest_teleop/"lift up the printer bed" dataset -- the *same* episode
#              public/data/episode.json is baked from, so this clip and the 3D model
#              on the site are two views of one recording.
#
# Deliberately not the head camera: the intact head-cam recording belongs to ep000002,
# and part of it shows a human arm reaching into the printer, which would misrepresent
# what the robot is doing on a page about automating exactly that. (The printer also
# occludes the head camera almost completely, which is why the policy leans on the
# wrist cameras in the first place.)
#
# Sources default to the repo root; raw footage there is gitignored and only the
# encoded output under public/media/ is committed.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/public/media"

WRIST_SRC="${WRIST_SRC:-$HOME/Downloads/bracketbot/dataset_backups/lift_up_the_printer_bed/1789818909_35018_4b1d9b82/datasets__quest_teleop__lift up the printer bed__video__arm_left_ep000000_6d3b9ded_0.mkv}"
PICKUP_SRC="${PICKUP_SRC:-$REPO/pickup print object.mp4}"
VLA_SRC="${VLA_SRC:-$REPO/normal speed fully VLA.mp4}"
TIMELAPSE_SRC="${TIMELAPSE_SRC:-$REPO/print timelapse.mp4}"

mkdir -p "$OUT"

# Sources are 640x480 at 30fps. Keep native resolution -- upscaling fisheye webcam
# footage only adds bytes. A mild denoise cleans up sensor and MJPEG noise so the
# encoder stops spending bitrate on it.
COMMON_VF="hqdn3d=2:1:3:3,format=yuv420p"

# encode <source> <basename> <poster-timestamp> <crf> <scale-filter>
encode() {
  local src="$1" name="$2" poster_at="$3" crf="$4" scale="$5"
  if [[ ! -f "$src" ]]; then
    echo "  skipping $name -- source not found: $src" >&2
    return
  fi
  echo "encoding $name..."
  ffmpeg -v error -y -i "$src" \
    -an -vf "${scale}${COMMON_VF}" \
    -c:v libx264 -profile:v main -crf "$crf" -preset slow \
    -movflags +faststart -pix_fmt yuv420p \
    "$OUT/$name.mp4"
  ffmpeg -v error -y -ss "$poster_at" -i "$src" \
    -vf "${scale}${COMMON_VF}" -frames:v 1 -q:v 4 \
    "$OUT/$name-poster.jpg"
}

# No webm: VP9 on this noisy fisheye source encoded larger than h264 at matching quality,
# and h264 plays everywhere, so the second file would be pure weight.
#
# Sized by how large each one actually renders: vla leads the hero, the rest run in a
# strip beneath it, and wrist-cam is the smallest tile of the four.
encode "$VLA_SRC" vla 6 28 "scale=-2:960,"
encode "$TIMELAPSE_SRC" timelapse 10 32 "scale=768:-2,"
encode "$PICKUP_SRC" pickup 2 27 "scale=560:-2,"
encode "$WRIST_SRC" wrist-cam 4 29 "scale=480:-2,"

echo
for f in "$OUT"/*.mp4 "$OUT"/*-poster.jpg; do
  [[ -f "$f" ]] && printf '  %-28s %s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"
done
