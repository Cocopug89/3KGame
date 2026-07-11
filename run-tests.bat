@echo off
REM ---------------------------------------------------------------------------
REM Runs the real build + test suite against THIS tree, on your machine, and
REM writes everything to test-output.log next to this file.
REM
REM Why it exists: Claude's shell runs in a Linux sandbox that sees this folder
REM through a network-style mount. npm can't manage node_modules over that mount
REM (it fails to unlink), and freshly-written files read back stale or truncated.
REM So the suite has to run HERE, natively — and the log it leaves behind is
REM something Claude's file tools can read back correctly.
REM
REM Double-click it, or run `run-tests.bat` from a terminal in this folder.
REM Safe to re-run; it overwrites the log each time. Takes ~1 minute.
REM ---------------------------------------------------------------------------

setlocal
cd /d "%~dp0"
set LOG=test-output.log

> "%LOG%" echo === 3KGame build + test === %DATE% %TIME%
>> "%LOG%" echo.

>> "%LOG%" echo --- node/npm versions ---
call node --version >> "%LOG%" 2>&1
call npm --version >> "%LOG%" 2>&1
>> "%LOG%" echo.

REM Only install if node_modules is missing — a full `npm ci` wipes and rebuilds
REM and is not what you want on every run.
if not exist "node_modules\" (
  >> "%LOG%" echo --- npm install ^(node_modules was missing^) ---
  call npm install >> "%LOG%" 2>&1
  >> "%LOG%" echo npm install exit=%ERRORLEVEL%
  >> "%LOG%" echo.
)

>> "%LOG%" echo --- npm run build ---
call npm run build >> "%LOG%" 2>&1
set BUILD_EXIT=%ERRORLEVEL%
>> "%LOG%" echo BUILD_EXIT=%BUILD_EXIT%
>> "%LOG%" echo.

>> "%LOG%" echo --- npm test ---
call npm test >> "%LOG%" 2>&1
set TEST_EXIT=%ERRORLEVEL%
>> "%LOG%" echo TEST_EXIT=%TEST_EXIT%
>> "%LOG%" echo.

>> "%LOG%" echo === DONE build=%BUILD_EXIT% test=%TEST_EXIT% ===

echo.
echo Build exit: %BUILD_EXIT%    Test exit: %TEST_EXIT%
echo Full output written to: %CD%\%LOG%
echo.
if not "%BUILD_EXIT%%TEST_EXIT%"=="00" (
  echo Something failed - the log has the details.
) else (
  echo All green.
)
echo.
pause
