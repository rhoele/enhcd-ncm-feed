param()
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Stop-AndWait([string]$msg, [bool]$isErr = $true) {
  Write-Host ""
  if ($isErr) { Write-Host -ForegroundColor Red ("[ERROR / FAILED] " + $msg) }
  else       { Write-Host -ForegroundColor Green ("[OK] " + $msg) }
  Write-Host ""
  Write-Host "This window will stay open. Scroll up to see the full output above."
  Write-Host "Fix any issues then re-run this .bat / .ps1."
  Write-Host ""
  Read-Host "Press ENTER to close this window"
  if ($isErr) { exit 1 } else { exit 0 }
}

function Run-Git {
  param([string[]]$Args)
  $oldEAP = $ErrorActionPreference
  $LASTEXITCODE = 0
  try {
    $ErrorActionPreference = 'Continue'
    & git @Args 2>&1 | ForEach-Object { Write-Host ("     git> " + $_) }
    return [int]$LASTEXITCODE
  } finally {
    $ErrorActionPreference = $oldEAP
  }
}

try {
  & node (Join-Path $PSScriptRoot 'scripts\lib\check-public.js') $PSScriptRoot
  if ($LASTEXITCODE -ne 0) { Stop-AndWait "Privacy check failed. Run regen-seed.bat before deploying." }
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Stop-AndWait "Git not found. Install git from https://git-scm.com/download/win first."
  }

  Write-Host ""
  Write-Host "================= GitHub Pages One-Click Deploy ================="
  Write-Host "Final URL style: https://USER.github.io/REPO/"
  Write-Host "Same format as https://currypeter0622.github.io/carryporter/"
  Write-Host "================================================================="
  Write-Host ""

  $ghUser = Read-Host "(1/3) Enter GitHub USERNAME (e.g. currypeter0622)"
  if ([string]::IsNullOrWhiteSpace($ghUser)) { Stop-AndWait "Username is empty" }
  $ghUser = $ghUser.Trim()

  $ghRepo = Read-Host "(2/3) Enter REPO name (MUST create this repo on github.com first; e.g. enhcd-ncm-feed)"
  if ([string]::IsNullOrWhiteSpace($ghRepo)) { Stop-AndWait "Repo name is empty" }
  $ghRepo = $ghRepo.Trim()

  $slug = "$ghUser/$ghRepo"
  $remote = "https://github.com/$slug.git"
  $pagesUrl = "https://$ghUser.github.io/$ghRepo/"
  if ($ghRepo -ieq "$ghUser.github.io") { $pagesUrl = "https://$ghUser.github.io/" }

  Write-Host ""
  Write-Host "Will push to: $remote"
  Write-Host "Final Pages URL: $pagesUrl"
  Write-Host ""

  if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.git'))) {
    Write-Host "[1/4] Initializing git repo (first run only) ..."
    $rc = Run-Git @('init','-q')
    if ($rc -ne 0) { Stop-AndWait "git init failed" }
  }

  Write-Host "[PRE] Checking git author identity ..."
  $oldEAP2 = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $curName  = $null
  $curEmail = $null
  try {
    $out = & git config --get user.name  2>$null
    if ($out) { $curName  = ($out | Select-Object -First 1).ToString() }
    $out2 = & git config --get user.email 2>$null
    if ($out2) { $curEmail = ($out2 | Select-Object -First 1).ToString() }
  } catch {}
  $ErrorActionPreference = $oldEAP2

  $needSetName  = [string]::IsNullOrWhiteSpace($curName)
  $needSetEmail = [string]::IsNullOrWhiteSpace($curEmail)
  if ($needSetName -or $needSetEmail) {
    $name  = if ($needSetName)  { "$ghUser" }                          else { $curName }
    $email = if ($needSetEmail) { "$ghUser@users.noreply.github.com" } else { $curEmail }
    Write-Host ("     Auto-setting local identity: user.name=""{0}""  user.email=""{1}""" -f $name,$email)
    $rc = Run-Git @('config','--local','user.name',$name)
    if ($rc -ne 0) { Stop-AndWait "git config user.name failed" }
    $rc = Run-Git @('config','--local','user.email',$email)
    if ($rc -ne 0) { Stop-AndWait "git config user.email failed" }
    Write-Host "     (stored LOCALLY for this repo only, not global)"
  } else {
    Write-Host ("     Using existing author: {0} <{1}>" -f $curName,$curEmail)
  }

  Write-Host "[2/4] Adding all files ..."
  $rc = Run-Git @('add','-A')
  if ($rc -ne 0) { Stop-AndWait "git add -A failed" }

  $msg = Read-Host "(3/3) Commit message (default: Deploy $ghRepo to Pages - just press ENTER)"
  if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "Deploy $ghRepo to Pages" }
  Write-Host "[3/4] Committing with message: $msg"
  $rc = Run-Git @('commit','-q','-m',$msg)
  $hasAnyCommit = $false
  try {
    $tmpEA = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = & git rev-parse --verify -q HEAD 2>$null
    if ($LASTEXITCODE -eq 0 -and $out) { $hasAnyCommit = $true }
    $ErrorActionPreference = $tmpEA
  } catch {}
  if ($rc -ne 0) {
    if (-not $hasAnyCommit) {
      Write-Host "  commit rc=$rc and repo has zero commits; retrying with --allow-empty to ensure first push succeeds ..."
      $rc2 = Run-Git @('commit','--allow-empty','-q','-m',$msg)
      if ($rc2 -ne 0) { Stop-AndWait "commit (--allow-empty) failed - cannot push without at least one commit. Fix the git> commit lines above and retry.`n  The most common fix is to run the script one more time after identity was saved." }
    } else {
      Write-Host -ForegroundColor Yellow "  commit rc=$rc but repo already has at least 1 commit (safe to push; nothing new this run)."
    }
  }

  Write-Host "[4/4] Pushing to origin/gh-pages ..."
  $oldEAP3 = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $originUrl = $null
  try {
    $o = & git remote get-url origin 2>$null
    if ($o) { $originUrl = ($o | Select-Object -First 1).ToString() }
  } catch {}
  $ErrorActionPreference = $oldEAP3

  if (-not [string]::IsNullOrWhiteSpace($originUrl)) {
    Write-Host "   step 1/4: removing existing origin -> $originUrl"
    $rc = Run-Git @('remote','remove','origin')
    if ($rc -ne 0) { Write-Host "     (non-fatal, continuing)" }
  } else {
    Write-Host "   step 1/4: no existing origin remote, skip remove"
  }

  Write-Host "   step 2/4: git remote add origin $remote"
  $rc = Run-Git @('remote','add','origin',$remote)
  if ($rc -ne 0) {
    Stop-AndWait ("Could not 'git remote add origin $remote'. Usually means:`n" +
      "  - mis-spelled username / repo name (case sensitive);`n" +
      "  - repo does not exist on github.com yet. Create it: Public, NO README / .gitignore / LICENSE`n" +
      "  Open: https://github.com/new?name=$ghRepo&user=$ghUser")
  }

  Write-Host "   step 3/4: git branch -M gh-pages"
  $rc = Run-Git @('branch','-M','gh-pages')
  if ($rc -ne 0) { Stop-AndWait "git branch -M gh-pages failed" }

  Write-Host "   step 4/4: git push -u origin gh-pages  <-- actual upload"
  Write-Host "   If a browser / login window pops up, sign in to GitHub there."
  $rc = Run-Git @('push','-u','origin','gh-pages')
  if ($rc -ne 0) {
    Stop-AndWait ("git push FAILED. Most common causes:`n" +
      "  1) Repo does not exist on github.com -> create it at:`n" +
      "     https://github.com/new?name=$ghRepo  (Public; do NOT tick README/.gitignore/LICENSE)`n" +
      "  2) Wrong username / repo spelling -> re-run with EXACT name on github.com`n" +
      "  3) Authentication / token issue -> 'git> push> ...' lines above say auth failed / permission denied.`n" +
      "  4) Network / VPN / proxy issue -> re-run later.")
  }

  Stop-AndWait ("SUCCESS. Pages URL (ready in 1-3 min): " + $pagesUrl + "`nAfter push, open repo Settings -> Pages -> Branch = gh-pages / root.") $false
} catch {
  $line = ""
  if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) { $line = " at line $($_.InvocationInfo.ScriptLineNumber)" }
  Stop-AndWait ("Unhandled PowerShell exception" + $line + ": " + $_.Exception.GetType().Name + " -> " + $_.Exception.Message)
}
