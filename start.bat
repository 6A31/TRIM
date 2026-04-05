@echo off
taskkill /F /IM electron.exe >nul 2>&1
set ELECTRON_RUN_AS_NODE=
set PATH=C:\Program Files\nodejs;%PATH%
cd /d C:\Users\Yoshi\Documents\Trim
start "" node_modules\electron\dist\electron.exe .
