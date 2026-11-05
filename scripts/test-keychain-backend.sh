#!/bin/sh
set -eu
TASK_PLUGIN_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TASK_JAVA_HOME=${JAVA_HOME:-$(/usr/libexec/java_home -v 11 2>/dev/null || true)}
TASK_BUILD=$(mktemp -d "${TMPDIR:-/tmp}/dbx-keychain-integration.XXXXXX")
trap 'rm -rf "$TASK_BUILD"' EXIT HUP INT TERM
TASK_RUNTIME_ROOT=${DBX_TEST_RUNTIME_ROOT:-$TASK_PLUGIN_ROOT}
TASK_CLASSPATH="$TASK_RUNTIME_ROOT/lib/kingbase-debugger.jar:$TASK_RUNTIME_ROOT/lib/gson.jar"
"$TASK_JAVA_HOME/bin/javac" --release 11 -encoding UTF-8 -cp "$TASK_CLASSPATH" -d "$TASK_BUILD/classes" "$TASK_PLUGIN_ROOT/backend/test/com/kingbase8/Driver.java" "$TASK_PLUGIN_ROOT/backend/test/local/dbx/kingbase/KeychainIntegrationTest.java"
"$TASK_JAVA_HOME/bin/jar" cf "$TASK_BUILD/fake-driver.jar" -C "$TASK_BUILD/classes" com/kingbase8
"$TASK_JAVA_HOME/bin/java" -cp "$TASK_BUILD/classes:$TASK_CLASSPATH" local.dbx.kingbase.KeychainIntegrationTest "$TASK_BUILD/fake-driver.jar"
