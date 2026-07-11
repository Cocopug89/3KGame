@echo off
REM ---------------------------------------------------------------------------
REM Take a restore point. Commits everything currently on disk, with a timestamp.
REM No-op if nothing changed. Run it whenever you like; it never reverts anything.
REM
REM Usage:  snapshot.bat              -> "snapshot: <date> <time>"
REM         snapshot.bat 3.4 done     -> "snapshot: 3.4 done"
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"

if not exist ".git\" (
  echo   No git repo here yet - run git-setup.bat first.
  pause
  exit /b 1
)

set MSG=%*
if "%MSG%"=="" set MSG=%DATE% %TIME%

git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo   Nothing changed since the last snapshot.
  goto :done
)

git commit -q -m "snapshot: %MSG%"
echo.
git log --oneline -1
git show --stat --format="" HEAD

:done
echo.
pause
