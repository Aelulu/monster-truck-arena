#!/bin/bash
# Convert a downloaded model (folder, .zip, or .7z — e.g. a Sketchfab download)
# into assets/trucks/<name>.glb, where the game picks it up automatically.
#
#   ./tools/ingest.sh ~/Downloads/bigfoot          # → assets/trucks/bigfoot.glb
#   ./tools/ingest.sh ~/Downloads/truck.zip mytruck
set -euo pipefail

SRC="${1:?usage: ingest.sh <folder-or-archive> [name]}"
BASE="$(basename "$SRC")"
NAME="${2:-$(echo "${BASE%.*}" | tr '[:upper:] ' '[:lower:]-')}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/trucks/$NAME.glb"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -d "$SRC" ]; then
  cp -R "$SRC/." "$WORK/"
else
  bsdtar -xf "$SRC" -C "$WORK"
fi

# Sketchfab "source" downloads often nest another archive — extract those too
find "$WORK" \( -iname '*.7z' -o -iname '*.zip' -o -iname '*.rar' \) -print0 |
  while IFS= read -r -d '' a; do bsdtar -xf "$a" -C "$(dirname "$a")" 2>/dev/null || true; done

GLB="$(find "$WORK" -iname '*.glb' | head -1)"
GLTF="$(find "$WORK" -iname '*.gltf' | head -1)"
OBJ="$(find "$WORK" -iname '*.obj' | head -1)"

if [ -n "$GLB" ]; then
  cp "$GLB" "$OUT"
elif [ -n "$GLTF" ]; then
  npx --yes gltf-pipeline -i "$GLTF" -o "$OUT" -b > /dev/null
elif [ -n "$OBJ" ]; then
  DIR="$(dirname "$OBJ")"
  # Gather any loose textures next to the OBJ, and point the MTL's diffuse
  # maps at PNG versions (browsers can't use the DDS files Max exports).
  find "$WORK" \( -iname '*.png' -o -iname '*.jpg' \) -not -path "$DIR/*" -exec cp {} "$DIR/" \; 2>/dev/null || true
  MTL="$(find "$DIR" -iname '*.mtl' | head -1)"
  if [ -n "$MTL" ]; then
    sed -i '' -E \
      -e '/map_Ka|map_d/d' \
      -e 's|(map_Kd[[:space:]]+).*[\\/]([^\\/[:space:]]+)\.[dD][dD][sS][[:space:]]*$|\1\2.png|' \
      -e 's|(map_Kd[[:space:]]+)([^\\/[:space:]]+)\.[dD][dD][sS][[:space:]]*$|\1\2.png|' \
      "$MTL"
  fi
  npx --yes obj2gltf -i "$OBJ" -o "$OUT" --binary > /dev/null
else
  echo "No .glb / .gltf / .obj found in $SRC" >&2
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ $NAME ($SIZE) → $OUT"
echo "  Reload the game — press T to cycle to it. If it faces the wrong way,"
echo "  add \"$NAME\": { \"rotationYDeg\": 90 } to assets/trucks/trucks.json"
