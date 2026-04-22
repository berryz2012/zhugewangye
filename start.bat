@echo off
cd /d "%~dp0"

echo ==============================================
echo ZG-WangYe AI DRAMA STUDIO - Start Script
echo ==============================================

echo Checking Node.js environment...
node -v >nul 2>&1
if errorlevel 1 goto NONODE

if not exist package.json goto NOPKG

if exist node_modules\ goto STARTAPP

echo Installing dependencies (this may take a few minutes)...
call npm install --no-fund --no-audit
if errorlevel 1 goto FAIL_INSTALL

:STARTAPP
echo.
echo Starting Local Server...
echo Please open http://localhost:3000 in your browser!
echo ==============================================
echo.
call npm run dev
echo.
echo Server has stopped or crashed. See any errors above.
pause
exit /b

:NONODE
echo [ERROR] Node.js is not found!
echo [INFO] Attempting to install Node.js automatically via winget...
winget install -e --id OpenJS.NodeJS.LTS --source winget --accept-package-agreements --accept-source-agreements >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Automatic installation failed. 
    echo Please install manually from https://nodejs.org/
) else (
    echo [SUCCESS] Node.js installed! Please RESTART this start.bat.
)
pause
exit /b

:NOPKG
echo [ERROR] package.json not found! Please run from the exact project folder.
pause
exit /b

:FAIL_INSTALL
echo [ERROR] npm install failed. Please check your network.
pause
exit /b