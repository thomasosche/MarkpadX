@echo off
setlocal

set "SRC=C:\Users\thoma\github\MarkpadX\src-tauri\target\release\Markpad.exe"
set "DEST_DIR=C:\Users\thoma\AppData\Local\Markpad"

if not exist "%SRC%" (
    echo [ERROR] Build artifact not found: %SRC%
    echo Run "npm run tauri build" first.
    exit /b 1
)

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

echo Closing any running Markpad...
taskkill /IM Markpad.exe /F >nul 2>&1

echo Copying %SRC% -^> %DEST_DIR%\Markpad.exe
copy /Y "%SRC%" "%DEST_DIR%\Markpad.exe"
if errorlevel 1 (
    echo [ERROR] Copy failed.
    exit /b 1
)

echo Done.
endlocal
