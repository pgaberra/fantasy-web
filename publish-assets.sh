#!/bin/sh
# Adds this build's scripts and stylesheets to the directory nginx serves them from, and prunes
# files no recent build uses. The image runs it from /docker-entrypoint.d, before nginx starts, so
# it is done before Coolify's health check can pass and before Traefik sends the container traffic.
#
# Why: Coolify deploys by starting the new container, waiting until it is healthy and only then
# stopping the old one, and for those seconds Traefik answers from both. Every script's name
# carries a hash of its content, so a page one container served asked the other for files it never
# had, and a tab left open across a deploy asked for chunks that were gone. On a deployed app both
# containers mount one volume at ASSETS_DIR, so every page either of them hands out finds its
# files. Without a volume, ASSETS_DIR is a plain directory in the image and nothing changes.
set -eu

BUILD_DIR=${BUILD_DIR:-/usr/share/nginx/html}
ASSETS_DIR=${ASSETS_DIR:-/usr/share/nginx/assets}
# A file stays while one of the newest KEEP_BUILDS builds lists it, so the container being replaced
# keeps its files however long ago it was deployed.
KEEP_BUILDS=${KEEP_BUILDS:-3}
# ...or while it was deployed within KEEP_DAYS, for a tab left open across many staging deploys.
KEEP_DAYS=${KEEP_DAYS:-14}

BUILDS_DIR="$ASSETS_DIR/.builds"
mkdir -p "$BUILDS_DIR"

cd "$BUILD_DIR"
manifest="$BUILDS_DIR/$(date -u +%Y%m%dT%H%M%S)-$$"
: >"$manifest.tmp"
for file in *.js *.css; do
  [ -f "$file" ] || continue
  echo "$file" >>"$manifest.tmp"
  if [ -f "$ASSETS_DIR/$file" ]; then
    # The same name means the same content, so only its age needs refreshing.
    touch "$ASSETS_DIR/$file"
  else
    # Copied under a temporary name and renamed, so the other container never serves half a file.
    cp "$file" "$ASSETS_DIR/.$file.tmp"
    mv "$ASSETS_DIR/.$file.tmp" "$ASSETS_DIR/$file"
  fi
done
mv "$manifest.tmp" "$manifest"

# Manifest names sort by time. Everything but the newest KEEP_BUILDS is only kept by its age.
manifests=$(find "$BUILDS_DIR" -maxdepth 1 -type f ! -name '*.tmp' | sort)
count=$(echo "$manifests" | wc -l)
recent=$(echo "$manifests" | tail -n "$KEEP_BUILDS")
kept=$(cat $recent | sort -u)

find "$ASSETS_DIR" -maxdepth 1 -type f -mtime +"$KEEP_DAYS" | while read -r path; do
  if ! echo "$kept" | grep -qxF "$(basename "$path")"; then
    rm -f "$path"
  fi
done

if [ "$count" -gt "$KEEP_BUILDS" ]; then
  echo "$manifests" | head -n "$((count - KEEP_BUILDS))" | while read -r old; do
    find "$old" -mtime +"$KEEP_DAYS" -exec rm -f {} +
  done
fi

echo "publish-assets: $(wc -l <"$manifest") files published to $ASSETS_DIR"
