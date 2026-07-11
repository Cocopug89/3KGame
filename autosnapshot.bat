@echo off
REM ---------------------------------------------------------------------------
REM Leave this running in its own window while the agents work. Every 2 minutes
REM it commits whatever is on disk, if anything changed.
REM
REM This is the whole point of the exercise: when an agent overwrites a shared
REM file from a stale snapshot and silently deletes someone else's keys, the
REM deletion lands in a commit — so you can SEE it (git log -p -- <file>) and
REM undo just that file (git checkout <commit> -- <file>) instead of noticing a
REM week later that Chinese prompts stopped rendering.
REM
REM Close the window to stop. It never reverts anything; it only records.
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"

if not exist ".git\" (
  echo   No git repo here yet - run git-setup.bat first.
  pause
  exit /b 1
)

echo.
echo   Auto-snapshotting %CD%
echo   Every 2 minutes. Close this window to stop.
echo.

:loop
git add -A
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "autosnapshot: %DATE% %TIME%"
  for /f "delims=" %%c in ('git log --oneline -1') do echo   [%TIME:~0,8%] %%c
) else (
  echo   [%TIME:~0,8%] no changes
)
timeout /t 120 /nobreak >nul
goto :loop
