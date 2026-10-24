@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Install it from https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\three\build\three.module.js" (
  echo Installing game dependencies. Internet access is required on first launch.
  call npm.cmd install
  if errorlevel 1 (
    echo Dependency installation failed. Check your connection and try again.
    pause
    exit /b 1
  )
)
echo Opening Aberrant Tide at http://127.0.0.1:4173
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$gameRoot = (Get-Location).Path; function Test-Game { try { $meta = Invoke-RestMethod -Uri 'http://127.0.0.1:4173/package.json' -TimeoutSec 2; return $meta.name -eq 'aberrant-tide' } catch { return $false } }; if (-not (Test-Game)) { Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList 'server.mjs' -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $gameRoot 'game-server.log') -RedirectStandardError (Join-Path $gameRoot 'game-server-error.log'); for ($attempt = 0; $attempt -lt 15; $attempt++) { Start-Sleep -Milliseconds 400; if (Test-Game) { break } } }; if (Test-Game) { Start-Process 'http://127.0.0.1:4173'; exit 0 }; Write-Host 'Could not start the game. Check game-server-error.log; port 4173 may already be occupied.'; exit 1"
if errorlevel 1 pause
endlocal
