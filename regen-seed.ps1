param()
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Stop-AndWait([string]$msg, [bool]$isErr = $true) {
  Write-Host ""
  if ($isErr) { Write-Host -ForegroundColor Red ("[ERROR / FAILED] " + $msg) }
  else       { Write-Host -ForegroundColor Green ("[OK] " + $msg) }
  Write-Host ""
  Write-Host "This window will stay open. Scroll up to see full output."
  Read-Host "Press ENTER to close this window"
  if ($isErr) { exit 1 } else { exit 0 }
}

try {
  $SRC = 'C:\netease-artist-feed'
  $DST = $PSScriptRoot

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Stop-AndWait "Node.js not found. Install from https://nodejs.org/zh-cn/download"
  }

  Write-Host ""
  Write-Host "Public distribution only: no cookies, playlists or private caches."
  $gen = Join-Path $SRC 'scripts\prepare-public.js'
  & node $gen $DST
  if ($LASTEXITCODE -ne 0) { Stop-AndWait "Public preparation failed; nothing should be deployed." }
  Stop-AndWait "Public configuration prepared and privacy checks passed." $false
} catch {
  $line = ""
  if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) { $line = " at line $($_.InvocationInfo.ScriptLineNumber)" }
  Stop-AndWait ("Unhandled PowerShell exception" + $line + ": " + $_.Exception.GetType().Name + " -> " + $_.Exception.Message)
}
