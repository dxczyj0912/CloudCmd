# ============================================================================
# tools/android/setup-toolchain.ps1 - install the Android build toolchain once
# ----------------------------------------------------------------------------
# Why this exists: building an APK needs a JDK + the Android SDK
# (build-tools / platform). This machine originally had neither. The script
# installs both into the STANDARD locations so every Android tool finds them
# by convention:
#
#     JDK     -> %LOCALAPPDATA%\Android\jdk
#     Android -> %LOCALAPPDATA%\Android\Sdk   (the default ANDROID_HOME)
#
# It installs only what building an APK actually needs: cmdline-tools,
# platform-tools, build-tools and platforms;android-34. It deliberately does
# NOT fetch emulator system images (several GB, not needed here).
#
# NOTE: this file is intentionally ASCII-only. Windows PowerShell 5.1 reads
# .ps1 files as ANSI unless they carry a BOM, which turns any non-ASCII
# character into mojibake and breaks the parser. Keep it ASCII.
#
# Usage (from the project root):
#   pwsh -File tools/android/setup-toolchain.ps1
# ============================================================================
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # the progress bar slows downloads

$Base   = Join-Path $env:LOCALAPPDATA 'Android'
$JdkDir = Join-Path $Base 'jdk'
$SdkDir = Join-Path $Base 'Sdk'
$TmpDir = Join-Path $env:TEMP ('cc-android-' + (Get-Random))
New-Item -ItemType Directory -Force -Path $Base, $TmpDir | Out-Null

function Say($m) { Write-Host "== $m" }

function Get-File($url, $out) {
  Say ("download " + (Split-Path $out -Leaf))
  $sw = [Diagnostics.Stopwatch]::StartNew()
  Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 1800
  $mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
  Say ("  done: $mb MB in " + [math]::Round($sw.Elapsed.TotalSeconds, 1) + "s")
}

# ------------------------------------------------------------------ 1. JDK 17
if (Test-Path (Join-Path $JdkDir 'bin\javac.exe')) {
  Say "JDK already present, skipping: $JdkDir"
} else {
  $jdkZip = Join-Path $TmpDir 'jdk17.zip'
  Get-File 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse' $jdkZip
  Say "extracting JDK ..."
  $ex = Join-Path $TmpDir 'jdkx'
  Expand-Archive -Path $jdkZip -DestinationPath $ex -Force
  $inner = (Get-ChildItem $ex -Directory | Select-Object -First 1).FullName
  if (Test-Path $JdkDir) { Remove-Item $JdkDir -Recurse -Force }
  Move-Item $inner $JdkDir
  Remove-Item $jdkZip -Force
}

$env:JAVA_HOME = $JdkDir
$env:PATH = (Join-Path $JdkDir 'bin') + ';' + $env:PATH
Say ("javac: " + (& (Join-Path $JdkDir 'bin\javac.exe') -version 2>&1))

# --------------------------------------------------- 2. Android cmdline-tools
$CmdTools = Join-Path $SdkDir 'cmdline-tools\latest'
if (Test-Path (Join-Path $CmdTools 'bin\sdkmanager.bat')) {
  Say "cmdline-tools already present, skipping"
} else {
  $ctZip = Join-Path $TmpDir 'cmdline-tools.zip'
  Get-File 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' $ctZip
  Say "extracting cmdline-tools ..."
  $ex2 = Join-Path $TmpDir 'ctx'
  Expand-Archive -Path $ctZip -DestinationPath $ex2 -Force
  New-Item -ItemType Directory -Force -Path (Join-Path $SdkDir 'cmdline-tools') | Out-Null
  if (Test-Path $CmdTools) { Remove-Item $CmdTools -Recurse -Force }
  # the official zip unpacks as cmdline-tools/ ; it must sit in
  # cmdline-tools/latest/ for sdkmanager to recognise itself
  Move-Item (Join-Path $ex2 'cmdline-tools') $CmdTools
  Remove-Item $ctZip -Force
}

$env:ANDROID_HOME = $SdkDir
$env:ANDROID_SDK_ROOT = $SdkDir
$SdkManager = Join-Path $CmdTools 'bin\sdkmanager.bat'

# ------------------------------------------------------------ 3. SDK packages
Say "installing SDK packages (platform-tools, build-tools;34.0.0, platforms;android-34) ..."
$yes = @()
for ($i = 0; $i -lt 40; $i++) { $yes += 'y' }
$yes | & $SdkManager "--sdk_root=$SdkDir" --licenses | Out-Null
$yes | & $SdkManager "--sdk_root=$SdkDir" 'platform-tools' 'build-tools;34.0.0' 'platforms;android-34'

Remove-Item $TmpDir -Recurse -Force -ErrorAction SilentlyContinue

# ------------------------------------------------------------------ 4. verify
Say "verify:"
$ok = $true
$want = @(
  (Join-Path $JdkDir 'bin\javac.exe'),
  (Join-Path $SdkDir 'build-tools\34.0.0\d8.bat'),
  (Join-Path $SdkDir 'build-tools\34.0.0\aapt2.exe'),
  (Join-Path $SdkDir 'build-tools\34.0.0\zipalign.exe'),
  (Join-Path $SdkDir 'build-tools\34.0.0\apksigner.bat'),
  (Join-Path $SdkDir 'platforms\android-34\android.jar'),
  (Join-Path $SdkDir 'platform-tools\adb.exe')
)
foreach ($p in $want) {
  $e = Test-Path $p
  if (-not $e) { $ok = $false }
  $mark = if ($e) { 'OK  ' } else { 'MISS' }
  Write-Host ("  [$mark] $p")
}
Say "JAVA_HOME    = $JdkDir"
Say "ANDROID_HOME = $SdkDir"
if ($ok) { Say "toolchain ready." } else { Say "some components are missing (see MISS above)." }
