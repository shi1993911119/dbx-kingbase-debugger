param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$PluginCli = "dbx-plugin",
    [string]$OutputDirectory = ""
)
$ErrorActionPreference = "Stop"
$PluginRoot = Split-Path $PSScriptRoot -Parent
if (!$OutputDirectory) { $OutputDirectory = Join-Path $PluginRoot "dist" }
if (!$JavaHome -or !(Test-Path (Join-Path $JavaHome "bin\javac.exe"))) { throw "Set JAVA_HOME to a JDK 11+ installation." }
$BuildRoot = Join-Path ([IO.Path]::GetTempPath()) ("dbx-kingbase-build-" + [Guid]::NewGuid())
$PreviousGoos = $env:GOOS; $PreviousGoarch = $env:GOARCH; $PreviousCgo = $env:CGO_ENABLED
function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}
try {
    $Stage = Join-Path $BuildRoot "plugin"
    New-Item -ItemType Directory -Force (Join-Path $Stage "lib"), (Join-Path $BuildRoot "classes") | Out-Null
    foreach ($Item in @("assets", "ui", "launcher", "manifest.json", "dbx-plugin.toml", "LICENSE", "THIRD-PARTY.md")) {
        Copy-Item (Join-Path $PluginRoot $Item) $Stage -Recurse
    }
    foreach ($Item in @("gson.jar", "GSON-LICENSE.txt", "GO-LICENSE.txt")) { Copy-Item (Join-Path $PluginRoot "lib\$Item") (Join-Path $Stage "lib") }
    $Sources = @(Get-ChildItem (Join-Path $PluginRoot "backend\src\local\dbx\kingbase\*.java") | ForEach-Object { $_.FullName })
    Invoke-Checked (Join-Path $JavaHome "bin\javac.exe") (@("--release", "11", "-encoding", "UTF-8", "-cp", (Join-Path $Stage "lib\gson.jar"), "-d", (Join-Path $BuildRoot "classes")) + $Sources)
    Invoke-Checked (Join-Path $JavaHome "bin\jar.exe") @("cf", (Join-Path $Stage "lib\kingbase-debugger.jar"), "-C", (Join-Path $BuildRoot "classes"), ".")
    $env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
    Push-Location (Join-Path $PluginRoot "native\windows")
    try { Invoke-Checked "go" @("build", "-trimpath", "-buildvcs=false", "-ldflags=-s -w", "-o", (Join-Path $Stage "lib\credential-helper.exe"), ".") }
    finally { Pop-Location }
    # Use the x64 distribution of the official CLI, including on Windows ARM64.
    # Keep CLI staging on a native Windows filesystem: some SMB/shared folders
    # cannot remove Rust's staging directories correctly after packaging.
    $Artifacts = Join-Path $BuildRoot "artifacts"
    Invoke-Checked $PluginCli @("package", $Stage, "--target", "windows-x64", "--output-dir", $Artifacts)
    New-Item -ItemType Directory -Force $OutputDirectory | Out-Null
    Get-ChildItem $Artifacts -File | Where-Object { $_.Name -like "*.dbxp" -or $_.Name -like "*.artifact.json" } | Copy-Item -Destination $OutputDirectory -Force
} finally {
    $env:GOOS = $PreviousGoos; $env:GOARCH = $PreviousGoarch; $env:CGO_ENABLED = $PreviousCgo
    if (Test-Path $BuildRoot) { Remove-Item $BuildRoot -Recurse -Force }
}
