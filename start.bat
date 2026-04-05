@echo off
taskkill /F /IM electron.exe >nul 2>&1
set ELECTRON_RUN_AS_NODE=
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron\dist\electron.exe" (
	echo Electron binary not found at node_modules\electron\dist\electron.exe
	echo Run npm install first.
	exit /b 1
)

start "" "node_modules\electron\dist\electron.exe" .
