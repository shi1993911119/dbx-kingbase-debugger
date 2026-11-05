## Plugin submission

- Plugin ID: `io.github.shi1993911119.kingbase-debugger`
- Version: `0.9.3`
- Publisher ID: `shi1993911119` (first submission, unverified)

## Source repository and tag

https://github.com/shi1993911119/dbx-kingbase-debugger/tree/v0.9.3

The immutable `v0.9.3` tag identifies the candidate source. Both unsigned artifacts, per-target metadata, `release-candidates.json` and `SHA256SUMS` are published under that version's author Release. Candidate SHA-256 and byte sizes are generated from the actual final packages. No packages or signing keys are added to this store repository.

Build entry points: `scripts/build.sh` (macOS ARM64) and `scripts/build-windows.ps1` (Windows x64); official DBX CLI 0.1.10, Go 1.27.3, Java `--release 11`, platform credential helpers. Source/build and dependency details: `docs/RELEASING.md`, `THIRD-PARTY.md`. Cross-toolchain byte-for-byte reproducibility is not claimed; the candidate metadata pins the submitted bytes.

## Capabilities and user workflow

Chinese-language KingbaseES Oracle-compatibility PL/SQL debugger. A toolbar command opens a single workbench with plugin-local connection management; users provide their own database endpoint and official JDBC JAR. Supports routine search, overload selection, parameter confirmation, breakpoint/step/continue/stop, source, variables, call stack, output parameters and OUT cursor tables. Pasting a call block fills parameter values without executing it. Starting a routine requires confirmation and really executes it.

Requires DBX >=0.6.65-beta.20261103.1 / Host API 1.x, local Java 11+, a user-provided Kingbase JDBC driver and database debugger permissions/extension. Earlier real-database testing used KingbaseES V008R006C007B0024 Oracle mode / plsql_pldbgapi 1.3 on macOS. The new stable ID has a separate data directory and credential service from the legacy `local.kingbase.debugger`; users reconfigure once.

## Permissions, data access, and network access

- `host.workbench`: open/reuse the debugger workbench from the command/toolbar.
- `host.events`: workbench/context lifecycle notifications and cleanup.

The UI uses this plugin's RPC. It does not read DBX ordinary saved connections or credentials. Native JDBC connects directly to the user-configured host:port with two dedicated sessions (target execution and debugger control), reads routine metadata/source, variables, stack and results, and invokes plsql_pldbgapi. No DBX SSH/proxy reuse or additional TLS settings UI. Native network access is outside browser Host permission gating.

Debugging can write data or have any effects implemented by the chosen routine; stop cannot undo already committed work. Cursor calls fetch/close results in a transaction before committing; non-cursor calls use auto-commit. There is no plugin telemetry, application API request or listening HTTP service in this code; selected drivers and routines can have their own network behavior.

Local profile JSON under `DBX_PLUGIN_DATA_DIR/debugger-connections.json` contains only ID/name/host/port/database/username/JDBC path/timeout. Passwords are excluded. Optional saved passwords use current-user macOS Keychain or Windows Credential Manager and a fixed plugin service plus destination-bound account key. Passwords travel through private pipes, not command arguments; UI receives saved-state booleans, not saved secrets. Credential helpers neither enumerate other entries nor migrate the legacy service. Database data and parameters are held in workbench/process memory, not uploaded by the plugin.

## Native sidecar behavior

Go launcher -> Java 11+ JDBC backend -> packaged OS credential helper when requested. On macOS the launcher uses syscall.Exec; on Windows a private kill-on-close Job Object cleans Java and descendants after normal/forced launcher exit. JSON-RPC is stdin/stdout. EOF, workbench close, stop, exceptions and deadlines clean up sessions.

Launcher probes absolute Java paths from DBX_KINGBASE_JAVA/JAVA_HOME, known JDK/DBeaver directories and PATH using `java -version`; starts Java without a shell. Java loads the explicitly selected local JDBC JAR (executable trusted code). Swift helper calls Security.framework; Windows Go helper calls CredReadW/CredWriteW/CredDeleteW. Native processes run with the OS user's privileges. Filesystem writes are plugin profile JSON/atomic-replace temporary files and opt-in OS credential entries. No proprietary Kingbase JDBC or Java runtime is shipped.

Validation and its limits are recorded in `docs/VALIDATION.md`: 152 backend assertions; UI/import/launcher/layout/shortcut tests; real macOS Chrome allow-scripts-only sandbox; final package identity, full checksums, architecture, current UI, Java 11, license and file allowlist checks; OS credential/RPC/cleanup tests with fresh synthetic items. Windows x64 runtime testing uses Windows 11 ARM64 x64 emulation. Physical Intel/AMD Windows, Windows 10 and a complete Windows DBX real-database session remain untested. No business database was accessed for this release preparation. GitHub Actions is supplied for future builds; its hosted run is not claimed as local validation evidence.

## License

MIT for project code. Unmodified Gson 2.14.0: Apache-2.0, verified against Maven Central. Go runtime: BSD-3-Clause. Both packages include LICENSE, THIRD-PARTY.md, GSON-LICENSE.txt and GO-LICENSE.txt. JDBC is supplied separately by users. This is not an official DBX/Kingbase plugin.

## Homepage or support URL

https://github.com/shi1993911119/dbx-kingbase-debugger

## Confirmation

- [x] The candidate packages are unsigned and match the disclosed source tag.
- [x] I have not included private keys, tokens, credentials, or proprietary data.
- [x] The candidates are listed in `candidates/io.github.shi1993911119.kingbase-debugger.json`; `plugins/` and `catalog/` were not edited manually.
