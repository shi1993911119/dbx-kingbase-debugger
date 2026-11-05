# Third-party components

Project code is MIT licensed; see `LICENSE`. These notices accompany both candidate packages.

| Component | Version / source | License | Distribution |
| --- | --- | --- | --- |
| Google Gson | 2.14.0, https://github.com/google/gson | Apache-2.0 (`lib/GSON-LICENSE.txt`) | Unmodified `lib/gson.jar` |
| Go standard library and runtime | Go 1.27.3, https://go.dev | BSD-3-Clause (`lib/GO-LICENSE.txt`) | Compiled into the launcher and Windows credential helper |
| Swift / Apple system frameworks | Apple toolchain and Security.framework | Installed platform libraries | macOS helper links to installed system libraries |

Gson Maven coordinates: `com.google.code.gson:gson:2.14.0`.
Official artifact: https://repo.maven.apache.org/maven2/com/google/code/gson/gson/2.14.0/gson-2.14.0.jar
SHA-256: `2cbd119bf1961c28788310963dc80ba65f58cdeec1dd139c8bdb1240faa2c36f`.
The bundled bytes were compared with that official artifact on 2026-11-05 and match exactly.

A Java 11+ runtime, DBX, and the proprietary Kingbase JDBC driver are **not bundled**. Users supply them locally under their respective licenses. The mock JDBC driver under `backend/test` is test code and is excluded from packages.

Development-only npm dependencies are recorded in `package-lock.json` and are excluded from the plugin. The official `@dbx-app/plugin-cli@0.1.10` builds unsigned review candidates and is not bundled in the plugin.
