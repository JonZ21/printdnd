#!/usr/bin/env bash
# Encode the robot's wrist-camera view into web-ready clips.
#
# Source is the left arm camera from ep000000 of the team's own
# quest_teleop/"lift up the printer bed" dataset -- the *same* episode that
# public/data/episode.json is baked from, so the clip and the 3D model on the site are
# two views of one recording.
#
# Deliberately not the head camera: the intact head-cam recording belongs to ep000002,
# and part of it shows a human arm reaching into the printer, which would misrepresent
# what the robot is doing on a page about automating exactly that.
#
# Usage: bash scripts/bake-clip.sh [source.mkv]

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO/public/media"

DEFAULT_SRC="$HOME/Downloads/bracketbot/dataset_backups/lift_up_the_printer_bed/1789818909_35018_4b1d9b82/datasets__quest_teleop__lift up the printer bed__video__arm_left_ep000000_6d3b9ded_0.mkv"
SRC="${1:-$DEFAULT_SRC}"

if [[ ! -f "$SRC" ]]; then
  echo "source clip not found: $SRC" >&2
  echo "pass the .mkv path as the first argument" >&2
  exit 1
fi

mkdir -p "$OUT"

# The source is 640x480 MJPEG at 30fps. Keep native resolution -- upscaling a fisheye
# webcam only adds bytes. A mild denoise cleans up MJPEG mosquito noise so the encoders
# stop spending bitrate on it.
COMMON_VF="hqdn3d=2:1:3:3,format=yuv420p"

echo "encoding mp4 (h264)..."
ffmpeg -v error -y -i "$SRC" \
  -an -vf "$COMMON_VF" \
  -c:v libx264 -profile:v main -crf 26 -preset slow \
  -movflags +faststart -pix_fmt yuv420p \
  "$OUT/wrist-cam.mp4"

# No webm: VP9 on this noisy fisheye source encoded larger than h264 at matching quality,
# and h264 plays everywhere, so the second file would be pure weight.

echo "extracting poster..."
ffmpeg -v error -y -ss 4 -i "$SRC" \
  -vf "$COMMON_VF" -frames:v 1 -q:v 4 \
  "$OUT/wrist-cam-poster.jpg"

echo
for f in "$OUT"/wrist-cam.mp4 "$OUT"/wrist-cam-poster.jpg; do
  printf '  %-28s %s\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"
done
