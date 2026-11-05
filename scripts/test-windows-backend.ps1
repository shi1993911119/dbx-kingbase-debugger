param([Parameter(Mandatory=$true)][string]$RuntimeRoot, [string]$JavaHome=$env:JAVA_HOME)
$ErrorActionPreference="Stop"
$PluginRoot=Split-Path $PSScriptRoot -Parent
$Scratch=Join-Path ([IO.Path]::GetTempPath()) ("dbx-vault-test-"+[Guid]::NewGuid())
New-Item -ItemType Directory (Join-Path $Scratch "classes") -Force | Out-Null
try {
    $ClassPath=(Join-Path $RuntimeRoot "lib\kingbase-debugger.jar")+";"+(Join-Path $RuntimeRoot "lib\gson.jar")
    & (Join-Path $JavaHome "bin\javac.exe") --release 11 -encoding UTF-8 -cp $ClassPath -d (Join-Path $Scratch "classes") (Join-Path $PluginRoot "backend\test\com\kingbase8\Driver.java") (Join-Path $PluginRoot "backend\test\local\dbx\kingbase\KeychainIntegrationTest.java") (Join-Path $PluginRoot "backend\test\local\dbx\kingbase\BackendTest.java")
    if ($LASTEXITCODE -ne 0) {throw "Compile integration test failed"}
    & (Join-Path $JavaHome "bin\jar.exe") cf (Join-Path $Scratch "fake-driver.jar") -C (Join-Path $Scratch "classes") com/kingbase8
    if ($LASTEXITCODE -ne 0) {throw "Build test driver failed"}
    & (Join-Path $JavaHome "bin\java.exe") "-Dfile.encoding=UTF-8" -cp ((Join-Path $Scratch "classes")+";"+$ClassPath) local.dbx.kingbase.BackendTest (Join-Path $Scratch "fake-driver.jar")
    if ($LASTEXITCODE -ne 0) {throw "Windows backend regression failed"}
    & (Join-Path $JavaHome "bin\java.exe") "-Dfile.encoding=UTF-8" -cp ((Join-Path $Scratch "classes")+";"+$ClassPath) local.dbx.kingbase.KeychainIntegrationTest (Join-Path $Scratch "fake-driver.jar")
    if ($LASTEXITCODE -ne 0) {throw "Credential integration test failed"}
} finally {Remove-Item $Scratch -Recurse -Force}
