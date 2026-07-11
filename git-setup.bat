@echo off
REM ---------------------------------------------------------------------------
REM ONE-TIME: turn this folder into a git repo and take a baseline commit.
REM
REM Safe to run while the four agents are working. `git init` + `git add` +
REM `git commit` only READ your files and write into .git\ — nothing in the
REM working tree is modified, moved, or reverted. Worst case, an agent saves a
REM file mid-commit and that half-save is what gets snapshotted; the next
REM snapshot (snapshot.bat) picks up the finished version a minute later.
REM
REM It must run HERE, natively, rather than from Claude's sandbox: the sandbox
REM sees this folder over a network mount that returns stale, truncated content
REM for recently-written files, and a repo built from that would have corrupt
REM files as its baseline.
REM
REM Double-click it, or run `git-setup.bat` from a terminal in this folder.
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"

where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo   git is not on your PATH. Git for Windows is installed ^(you have Git Bash^),
  echo   so either run this from Git Bash / Git CMD, or add git to PATH.
  echo.
  pause
  exit /b 1
)

if exist ".git\" (
  echo.
  echo   This is already a git repo - nothing to set up.
  echo   Use snapshot.bat to take a commit.
  echo.
  git log --oneline -5
  echo.
  pause
  exit /b 0
)

echo.
echo   Initialising git repo in %CD%
echo.

git init -b main
if errorlevel 1 goto :failed

REM Repo-local identity only (does not touch your global git config).
git config user.name  >nul 2>&1 || git config user.name "3K agents"
git config user.email >nul 2>&1 || git config user.email "agents@localhost"

REM Never rewrite line endings: four agents write these files from two different
REM operating systems, and autocrlf turns that into a whole-file phantom diff
REM that hides the real clobbers this repo exists to catch.
git config core.autocrlf false

git add -A
if errorlevel 1 goto :failed

git commit -q -m "baseline: pre-version-control state (phases 3/4/5/6 in flight, 4 concurrent agents)"
if errorlevel 1 goto :failed

echo.
echo   Done. Baseline commit:
echo.
git log --oneline -1
git show --stat --oneline HEAD | find /c "|" > nul
echo.
echo   From now on: run snapshot.bat any time to save a restore point,
echo   or leave autosnapshot.bat running to do it every 2 minutes.
echo.
pause
exit /b 0

:failed
echo.
echo   Something failed above. Nothing was reverted - your files are untouched.
echo.
pause
exit /b 1
