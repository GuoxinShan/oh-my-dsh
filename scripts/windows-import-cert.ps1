# Import an Authenticode PFX (or reuse a store thumbprint) and write the
# Tauri merge config that `tauri build --config` consumes. No-op is not this
# script's job: callers skip invoking it when no certificate is configured.
#
# Env (one of):
#   WINDOWS_CERTIFICATE + WINDOWS_CERTIFICATE_PASSWORD
#     base64 of the .pfx (whitespace ignored)
#   WINDOWS_PFX_PATH + WINDOWS_CERTIFICATE_PASSWORD
#     path to a .pfx file
#   WINDOWS_CERTIFICATE_THUMBPRINT
#     cert already in CurrentUser\My; just write the merge config
#
# Optional:
#   WINDOWS_TIMESTAMP_URL  default http://timestamp.digicert.com
#
# Writes: src-tauri/tauri.windows-sign.json (gitignored)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$outConfig = Join-Path $repoRoot 'src-tauri\tauri.windows-sign.json'
$timestamp = if ($env:WINDOWS_TIMESTAMP_URL) { $env:WINDOWS_TIMESTAMP_URL } else { 'http://timestamp.digicert.com' }
$thumb = if ($env:WINDOWS_CERTIFICATE_THUMBPRINT) { ($env:WINDOWS_CERTIFICATE_THUMBPRINT -replace '\s', '') } else { $null }

if (-not $thumb) {
  $pfxPath = Join-Path $env:TEMP 'dsh-desktop-codesign.pfx'
  if ($env:WINDOWS_CERTIFICATE) {
    $b64 = ($env:WINDOWS_CERTIFICATE -replace '\s', '')
    [IO.File]::WriteAllBytes($pfxPath, [Convert]::FromBase64String($b64))
  } elseif ($env:WINDOWS_PFX_PATH) {
    if (-not (Test-Path -LiteralPath $env:WINDOWS_PFX_PATH)) {
      throw "WINDOWS_PFX_PATH not found: $($env:WINDOWS_PFX_PATH)"
    }
    Copy-Item -LiteralPath $env:WINDOWS_PFX_PATH -Destination $pfxPath -Force
  } else {
    throw 'need WINDOWS_CERTIFICATE (base64 pfx), WINDOWS_PFX_PATH, or WINDOWS_CERTIFICATE_THUMBPRINT'
  }
  if (-not $env:WINDOWS_CERTIFICATE_PASSWORD) {
    throw 'WINDOWS_CERTIFICATE_PASSWORD is required to import a PFX'
  }
  $secure = ConvertTo-SecureString -String $env:WINDOWS_CERTIFICATE_PASSWORD -Force -AsPlainText
  $imported = @(Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $secure)
  $leaf = $imported | Where-Object { $_.HasPrivateKey } | Select-Object -First 1
  if (-not $leaf) { $leaf = $imported | Select-Object -First 1 }
  if (-not $leaf) { throw 'PFX imported but no certificate object came back' }
  $thumb = $leaf.Thumbprint
  Remove-Item -LiteralPath $pfxPath -Force -ErrorAction SilentlyContinue
}

$json = @{
  bundle = @{
    windows = @{
      certificateThumbprint = $thumb
      digestAlgorithm = 'sha256'
      timestampUrl = $timestamp
    }
  }
} | ConvertTo-Json -Depth 6
[IO.File]::WriteAllText($outConfig, $json.Trim() + "`n")
if ($env:GITHUB_ENV) {
  Add-Content -LiteralPath $env:GITHUB_ENV -Value "WINDOWS_CERTIFICATE_THUMBPRINT=$thumb"
}
Write-Host "windows-import-cert: thumbprint=$thumb -> $outConfig"
