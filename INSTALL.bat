@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Install Node.js first & pause & exit /b 1)
call npm install --no-audit --no-fund || goto fail
call npm run check || goto fail
call npm run dist:win || goto fail
start "" "%~dp0dist"
exit /b 0
:fail
echo Build failed
pause
exit /b 1