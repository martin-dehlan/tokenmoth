#!/usr/bin/env pwsh
# TokenMoth CLI installer for Windows (PowerShell). Downloads a prebuilt
# tokenmoth.exe from the public distribution host and puts it on PATH
# (repo stays private; no Rust needed). Mirror of install.sh for Unix.
#
#   irm https://get.tokenmoth.com/install.ps1 | iex
#
# Env: TOKENMOTH_BIN_DIR  (default %LOCALAPPDATA%\tokenmoth)
#      TOKENMOTH_DIST_BASE (override the dist host)
$ErrorActionPreference = 'Stop'

# Branded dist domain (CloudFront -> S3, see issue #124); raw S3 is the
# transitional fallback if the branded host is unreachable.
$Base     = if ($env:TOKENMOTH_DIST_BASE) { $env:TOKENMOTH_DIST_BASE } else { 'https://get.tokenmoth.com' }
$Fallback = 'https://tokenmoth-dist.s3.eu-central-1.amazonaws.com'
$BinDir   = if ($env:TOKENMOTH_BIN_DIR) { $env:TOKENMOTH_BIN_DIR } else { Join-Path $env:LOCALAPPDATA 'tokenmoth' }

switch ($env:PROCESSOR_ARCHITECTURE) {
  'AMD64' { $target = 'x86_64-pc-windows-msvc' }
  'ARM64' {
    # No native ARM64 build yet — x64 runs under Windows emulation.
    $target = 'x86_64-pc-windows-msvc'
    Write-Host 'tokenmoth: no native ARM64 build yet - installing x64 (runs under emulation).'
  }
  default { throw "tokenmoth: unsupported architecture $($env:PROCESSOR_ARCHITECTURE)" }
}

Write-Host "-> downloading tokenmoth ($target)..."
$tmp = Join-Path $env:TEMP ('tokenmoth-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
try {
  $archive = Join-Path $tmp 'tokenmoth.tar.gz'
  $shaFile = Join-Path $tmp 'tokenmoth.tar.gz.sha256'
  try {
    Invoke-WebRequest -Uri "$Base/tokenmoth-$target.tar.gz" -OutFile $archive -UseBasicParsing
    Invoke-WebRequest -Uri "$Base/tokenmoth-$target.tar.gz.sha256" -OutFile $shaFile -UseBasicParsing
  } catch {
    Write-Host "  $Base failed ($($_.Exception.Message)) - falling back to S3..."
    Invoke-WebRequest -Uri "$Fallback/tokenmoth-$target.tar.gz" -OutFile $archive -UseBasicParsing
    Invoke-WebRequest -Uri "$Fallback/tokenmoth-$target.tar.gz.sha256" -OutFile $shaFile -UseBasicParsing
  }

  # Verify the archive against the published .sha256 sidecar before extracting.
  $expected = ((Get-Content -Path $shaFile -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Path $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if (-not $expected -or $actual -ne $expected) {
    throw "tokenmoth: SHA-256 MISMATCH for tokenmoth-$target.tar.gz (expected $expected, got $actual). The download is corrupted or has been tampered with. Aborting."
  }
  Write-Host '  + sha256 verified'

  # tar ships with Windows 10 1803+ and extracts .tar.gz natively.
  tar -xzf $archive -C $tmp
  if ($LASTEXITCODE -ne 0) { throw 'tokenmoth: failed to extract archive (is `tar` available? Windows 10 1803+ required).' }
  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
  Copy-Item -Path (Join-Path $tmp 'tokenmoth.exe') -Destination (Join-Path $BinDir 'tokenmoth.exe') -Force
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host "+ installed -> $BinDir\tokenmoth.exe"

# Add to the user PATH (persistent) if missing; also update the current session.
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $BinDir) {
  [Environment]::SetEnvironmentVariable('Path', "$userPath;$BinDir", 'User')
  $env:Path = "$env:Path;$BinDir"
  Write-Host "  added $BinDir to your user PATH (restart your terminal to pick it up)."
}

Write-Host '  next:  tokenmoth setup --key <your-key> --api-url https://api.tokenmoth.com'
