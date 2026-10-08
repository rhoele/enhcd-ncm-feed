@echo off
echo ========================================================
echo  Starting: regen-seed.ps1
echo  (This window will NOT auto-close. Stay open.)
echo ========================================================
echo.
chcp 65001 >nul
powershell -NoProfile -NoExit -ExecutionPolicy Bypass -File "%~dp0regen-seed.ps1"
echo.
echo ========================================================
echo  PowerShell returned to cmd. Scroll up for errors above.
echo ========================================================
pause
