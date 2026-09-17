#!/bin/sh
# Exercises publish-assets.sh the way deploys use it: several builds in turn publishing into one
# assets directory. Runs inside nginx:alpine (see pr-checks.yml), so find, touch and date are the
# busybox ones the image has, not the runner's.
set -eu

work=$(mktemp -d)
export ASSETS_DIR="$work/assets" KEEP_BUILDS=2 KEEP_DAYS=14
mkdir -p "$ASSETS_DIR"

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

# Publishes a build made of the given file names, each holding its own name as content.
publish() {
  build="$work/build-$1"
  shift
  mkdir -p "$build"
  for name in "$@"; do echo "$name" >"$build/$name"; done
  echo '<html></html>' >"$build/index.html"
  BUILD_DIR="$build" sh ./publish-assets.sh >/dev/null
  # Manifest names carry the time to the second; keep successive builds apart.
  sleep 1
}

# Ages a published file, or every manifest, as if it had been deployed long ago.
age() { touch -d '2020-01-01 00:00:00' "$@"; }

publish 1 main-A.js styles-A.css chunk-shared.js
[ -f "$ASSETS_DIR/main-A.js" ] || fail 'the first build was not published'
[ -f "$ASSETS_DIR/index.html" ] && fail 'a page was published along with the assets'

publish 2 main-B.js styles-B.css chunk-shared.js
[ -f "$ASSETS_DIR/main-A.js" ] || fail 'the build being replaced lost its files'
[ -f "$ASSETS_DIR/main-B.js" ] || fail 'the second build was not published'

# Build 1 is old and has fallen out of the newest two builds: its own files go, shared ones stay.
age "$ASSETS_DIR"/*.js "$ASSETS_DIR"/*.css "$ASSETS_DIR"/.builds/*
publish 3 main-C.js styles-C.css chunk-shared.js
[ -f "$ASSETS_DIR/main-B.js" ] || fail 'an old file one of the newest builds lists was pruned'
[ -f "$ASSETS_DIR/chunk-shared.js" ] || fail 'a file the new build republished was pruned'
[ -f "$ASSETS_DIR/main-A.js" ] && fail 'a file no recent build lists was kept'
[ -f "$ASSETS_DIR/styles-A.css" ] && fail 'a stylesheet no recent build lists was kept'

# A file no recent build lists, but deployed within KEEP_DAYS, is kept for a tab still open on it.
publish 4 main-D.js
publish 5 main-E.js
[ -f "$ASSETS_DIR/main-C.js" ] || fail 'a recently deployed file was pruned'

manifests=$(find "$ASSETS_DIR/.builds" -type f | wc -l)
[ "$manifests" -eq 3 ] || fail "expected aged manifests beyond the newest two to be pruned, found $manifests"

echo 'publish-assets.sh: all checks passed'
