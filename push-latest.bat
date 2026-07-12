@echo off
REM One-click: commit everything local and push to GitHub (pre-deploy).
REM Uses --force because the GitHub copy is a stale upload with different
REM history than this folder's git — this folder is canonical.
cd /d "%~dp0"

echo === Push latest to GitHub ===

if exist ".git\index.lock" (
  echo Removing stale .git\index.lock from the crashed autosnapshot...
  del /f ".git\index.lock"
)

git add -A
git commit -m "7.2 fixes: lightning death race, guicai retrial duplication, deterministic soak; perf pass (triggers/legalTargets/GameLog)"

git remote remove origin 2>nul
git remote add origin https://github.com/Cocopug89/3KGame.git
git branch -M main
git push -u origin main --force

echo.
echo === DONE - if a browser window popped up asking for GitHub login, ===
echo === complete it and this window will continue automatically.     ===
pause
