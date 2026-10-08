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
  Write-Host "============ Regenerate Pages Seed (Pick Mode) ============"
  Write-Host "  1 = Lightweight seed only (settings + my_artists IDs, ~1-3KB)"
  Write-Host "  2 = Mode 1 + browser dump (Cookie / playlists / all saved cache)"
  Write-Host "       HOW: On http://127.0.0.1:8001/index-enhanced.html open F12 Console:"
  Write-Host "            copy(JSON.stringify(localStorage))  -> paste into:"
  Write-Host "            C:\netease-artist-feed\local-dump.json  (save file)"
  Write-Host "  3 = Mode 2 + ALL VA big caches (album-date / owned / artist-songs)"
  Write-Host "==========================================================="
  Write-Host ""

  $mode = Read-Host "Enter mode [1 / 2 / 3]  (default 1 - press ENTER)"
  if ([string]::IsNullOrWhiteSpace($mode)) { $mode = '1' }

  $argsList = @()
  if ($mode -eq '1') {
    Write-Host "Mode 1: Lightweight seed (no dump)"
    $argsList += '--seed-version','3'
  } elseif ($mode -eq '2') {
    $dump = Join-Path $SRC 'local-dump.json'
    if (-not (Test-Path -LiteralPath $dump)) {
      Stop-AndWait ("Missing file: " + $dump + "`nFirst copy browser localStorage JSON into that file then re-run.")
    }
    Write-Host "Mode 2: Lightweight + browser dump"
    $argsList += '--dump',$dump,'--seed-version','3'
  } elseif ($mode -eq '3') {
    $dump = Join-Path $SRC 'local-dump.json'
    if (-not (Test-Path -LiteralPath $dump)) {
      Stop-AndWait ("Missing file: " + $dump + "`nFirst copy browser localStorage JSON into that file then re-run.")
    }
    Write-Host "Mode 3: Lightweight + dump + ALL VA caches (may be large)"
    $argsList += '--dump',$dump,'--include-va-album-date','--include-owned','--include-artist-songs','--force','--seed-version','3'
  } else {
    Stop-AndWait ("Invalid mode: " + $mode + " (must be 1 / 2 / 3)")
  }

  $gen = Join-Path $SRC 'scripts\generate-seed.js'
  $showList = @($argsList | ForEach-Object { if ("$_" -match '\s') { """$_""" } else { "$_" } })
  Write-Host ("Running: node """ + $gen + """ " + ($showList -join ' '))
  & node $gen $argsList 2>&1 | ForEach-Object { Write-Host ("  node> " + $_) }
  if ($LASTEXITCODE -ne 0) { Stop-AndWait ("generate-seed.js exited with code " + $LASTEXITCODE) }

  $srcSeed = Join-Path $SRC 'seed-settings.js'
  if (-not (Test-Path -LiteralPath $srcSeed)) { Stop-AndWait ("generate-seed.js did not produce output file: " + $srcSeed) }
  $dstSeed = Join-Path $DST 'seed-settings.js'
  Write-Host ""
  Write-Host ("Copying seed-settings.js into ghpages dist: " + $dstSeed)
  Copy-Item -LiteralPath $srcSeed -Destination $dstSeed -Force
  Stop-AndWait "Seed regenerated. Now run deploy-pages.bat (部署到GitHub Pages.bat) to upload." $false
} catch {
  $line = ""
  if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) { $line = " at line $($_.InvocationInfo.ScriptLineNumber)" }
  Stop-AndWait ("Unhandled PowerShell exception" + $line + ": " + $_.Exception.GetType().Name + " -> " + $_.Exception.Message)
}
