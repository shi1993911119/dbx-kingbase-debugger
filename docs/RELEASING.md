# Candidate build and store submission

Source repository: https://github.com/shi1993911119/dbx-kingbase-debugger

Publisher: `shi1993911119`. Stable plugin ID: `io.github.shi1993911119.kingbase-debugger`.

## Tools and inputs

- Go **1.27.3**, official `@dbx-app/plugin-cli` **0.1.10**.
- JDK 11+ with `javac --release 11`; local macOS validation uses Azul 11.0.16.1, Windows uses Microsoft OpenJDK 21.0.9 x64.
- macOS ARM64 with Swift/Security.framework for the Mac package; Windows with the **x64** official CLI for `windows-x64`.
- Node.js 20+ and Python 3.9+ for tests and package checks. CI uses Node 22 and Python 3.12.
- Pinned, unmodified Gson JAR and its SHA-256 in `THIRD-PARTY.md`. No proprietary JDBC file is needed for builds/tests.

`lib/kingbase-debugger.jar` and native helpers are generated in a temporary stage and are not tracked. The CLI compiles the Go launcher and produces `.dbxp` plus `.artifact.json`. JAR timestamps/compiler versions can vary across machines; byte-for-byte reproducibility across toolchains is not claimed. The release metadata pins the exact candidate bytes reviewed by the store.

## Build and test

```sh
npm ci
npm install --global --registry https://registry.npmjs.org @dbx-app/plugin-cli@0.1.10
sh scripts/test-backend.sh
npm run test:ui
npm run test:import
npm run test:launcher
npm run test:layout
npm run test:shortcuts
npx playwright install chromium
npm run test:browser
sh scripts/build.sh
```

On Windows, set `JAVA_HOME`, put Go and the x64 CLI on PATH, then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-windows.ps1
```

Collect only the two current-version `.dbxp` and `.artifact.json` files in `dist/`. Never upload an older ignored package. Then run:

```sh
python3 scripts/verify-packages.py --extract-to .dbx-dev/verified-runtime
node scripts/release-metadata.mjs
```

The extraction destination must be fresh. For macOS synthetic-only credential tests:

```sh
DBX_TEST_RUNTIME_ROOT="$PWD/.dbx-dev/verified-runtime/darwin-arm64" python3 scripts/test-keychain.py
DBX_TEST_RUNTIME_ROOT="$PWD/.dbx-dev/verified-runtime/darwin-arm64" sh scripts/test-keychain-backend.sh
```

Windows package tests: `node scripts/test-windows.cjs <unpacked-root> <absolute-java.exe>` and `scripts/test-windows-backend.ps1 -RuntimeRoot <unpacked-root> -JavaHome <jdk>`. They create/remove fresh synthetic credential entries. They never enumerate existing credentials or connect to a real database.

## Release and submission

1. Commit the reviewed source and create immutable tag `v<manifest.version>` at that commit. Source must be publicly readable before review.
2. Publish a GitHub Release for that tag with exactly the current `.dbxp`, `.artifact.json`, `release-candidates.json`, `SHA256SUMS` and release notes. The workflow `.github/workflows/plugin-release.yml` can build/test/publish by manually running it against a version tag. It refuses an existing Release to avoid overwriting candidate bytes. Local candidates may instead be uploaded directly once authentication is available.
3. `scripts/release-metadata.mjs` generates `dist/store-submission/publishers/*.json` and `dist/store-submission/candidates/*.json` from the actual package hashes and sizes. Submit those JSON files to a fork of `t8y2/dbx-store`; keep binaries in the author's Release.
4. Optionally register this public repository with `autoUpdate: true` in `automation/plugin-sources.json` for future releases. No signing key or store automation secret belongs in this repository.
5. Validate a store checkout with `node scripts/validate.mjs --plan-candidates`. Plain validation intentionally fails while unsigned candidates await store signing. Do not manually edit generated `plugins/` or `catalog/`.
6. Use `docs/STORE-PR.md` as the review description. Enable maintainer edits. DBX maintainers review, sign the pinned bytes, finalize the catalog and merge.

The official process is documented at https://github.com/t8y2/dbx-store/blob/main/CONTRIBUTING.md. Local structural validation does not prove public URL accessibility or store acceptance.
