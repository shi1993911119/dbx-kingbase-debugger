#!/bin/sh
set -eu
TASK_PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TASK_JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 11 2>/dev/null || true)}
TASK_OUTPUT=${DBX_OUTPUT_DIR:-$TASK_PLUGIN_ROOT/dist}
if [ ! -x "$TASK_JAVA_HOME/bin/javac" ]; then
  echo "Set JAVA_HOME to a JDK 11+ installation." >&2
  exit 1
fi
TASK_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/dbx-kingbase-build.XXXXXX")
trap 'rm -rf "$TASK_BUILD"' EXIT HUP INT TERM
TASK_STAGE="$TASK_BUILD/plugin"
mkdir -p "$TASK_STAGE/lib" "$TASK_BUILD/classes"
for item in assets ui launcher manifest.json dbx-plugin.toml LICENSE THIRD-PARTY.md; do
  cp -R "$TASK_PLUGIN_ROOT/$item" "$TASK_STAGE/"
done
for item in gson.jar GSON-LICENSE.txt GO-LICENSE.txt; do
  cp "$TASK_PLUGIN_ROOT/lib/$item" "$TASK_STAGE/lib/"
done
"$TASK_JAVA_HOME/bin/javac" --release 11 -encoding UTF-8 -cp "$TASK_STAGE/lib/gson.jar" -d "$TASK_BUILD/classes" "$TASK_PLUGIN_ROOT"/backend/src/local/dbx/kingbase/*.java
"$TASK_JAVA_HOME/bin/jar" cf "$TASK_STAGE/lib/kingbase-debugger.jar" -C "$TASK_BUILD/classes" .
xcrun swiftc -O -target arm64-apple-macosx11.0 -framework Security "$TASK_PLUGIN_ROOT/native/keychain.swift" -o "$TASK_STAGE/lib/keychain-helper"
"${DBX_PLUGIN_CLI:-dbx-plugin}" package "$TASK_STAGE" --target darwin-arm64 --output-dir "$TASK_OUTPUT"
