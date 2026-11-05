# Permissions and native behavior

This is a third-party plugin, not an official DBX or Kingbase product. Its native code runs with the current OS user's privileges. Only load a trusted JDBC JAR: Java loads and executes `com.kingbase8.Driver` from the file the user selects.

## Host permissions

- `host.workbench`: opens/reuses the debugger workbench from its command and toolbar entry.
- `host.events`: receives workbench lifecycle/context events for cancellation and cleanup.

The manifest requests these two permissions. The UI calls this plugin's JSON-RPC backend; it does not read DBX's saved connection list or credentials. Native JDBC network access is separate from browser Host permission checks.

## Files and credentials

The backend reads the user-selected local JDBC JAR and the packaged runtime JARs. The launcher checks absolute Java executable candidates from `DBX_KINGBASE_JAVA`, `JAVA_HOME`, known JDK/DBeaver directories and PATH, runs `java -version`, then launches Java 11+. Package-relative paths are passed as arguments, without invoking a shell.

The plugin writes `DBX_PLUGIN_DATA_DIR/debugger-connections.json` with profile ID, name, host, port, database, username, JDBC path and timeout. Replacement uses a temporary file in the same directory. Passwords are excluded by an explicit field allowlist. Connection fields are personal configuration and should stay out of source control.

Remembering a password is optional. The macOS Swift helper uses Security.framework; the Windows Go helper uses CredReadW/CredWriteW/CredDeleteW. Both access only the fixed service `io.github.shi1993911119.kingbase-debugger.database-password` and per-profile destination hashes. Windows adds `/` before the account key. Passwords travel through private process pipes, never command arguments. Saved passwords are not returned to the UI; it receives presence state. macOS entries do not synchronize to iCloud; Windows uses local-machine persistence for the current user. Helpers do not enumerate unrelated credentials. Legacy `local.kingbase.debugger` entries are not migrated or read.

Credentials necessarily exist in process memory during connection and JDBC calls; Java/driver-managed copies cannot be guaranteed to be erased immediately. Driver and OS behavior remain outside this plugin's control.

## Database access and effects

The backend opens two dedicated JDBC sessions directly to the host and port entered by the user: execution and debugger control. It reads routine catalogs, source, parameters, variables, stacks, breakpoints and returned result sets, and invokes Kingbase's `plsql_pldbgapi` APIs. It does not reuse DBX SSH/proxy tunnels. There is no added TLS configuration UI.

Starting debugging executes the chosen routine and can change data or call external services through that routine. A confirmation dialog precedes execution. Cursor calls use a transaction, fetch/close results, then commit; non-cursor calls retain auto-commit. Stop cannot undo changes already committed by the routine. Test with an independent routine before using business procedures.

Plugin code does not start an HTTP listener, upload telemetry, or contact an application service. Network activity comes from the selected JDBC driver and database/routine behavior. No Kingbase driver is redistributed.

## Process lifecycle and limits

A native Go launcher starts the Java backend. On macOS, `syscall.Exec` preserves stdio and the process identity. On Windows, a private kill-on-close Job Object cleans up Java and descendants on launcher exit or forced termination. Java starts the packaged credential helper only for a requested operation; helper calls have a timeout. JSON-RPC uses stdin/stdout. EOF, workbench close, stop, connection errors and deadlines clean up sessions.

Search returns at most 500 routines; inspection/result display is limited to 2,000 rows and about 2 Mi characters. Debugging has a 10-minute overall limit. The UI has no arbitrary SQL editor, source compiler or variable editor.

## Reporting

Report issues at https://github.com/shi1993911119/dbx-kingbase-debugger/issues with synthetic examples. Do not include database passwords, real connection profiles, business SQL, query results or private JDBC files in public issues. Coordinate privately before disclosing sensitive material.
