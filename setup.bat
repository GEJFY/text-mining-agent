@echo off
setlocal enabledelayedexpansion
echo ========================================
echo  NexusText AI v7.0 - Initial Setup
echo ========================================
echo.

cd /d "%~dp0"

REM --- Create .env file ---
if not exist ".env" (
    echo [1/4] Creating .env file...
    copy .env.example .env >nul
    echo       Copied .env.example to .env
    echo       Edit .env to set your LLM API keys.
) else (
    echo [1/4] .env already exists. Skipping.
)
echo.

REM --- Backend setup ---
REM OneDrive locks files during sync, so venv is created outside OneDrive.
REM A junction link connects backend\venv to the external location.
set "VENV_EXTERNAL=C:\temp\nexustext-venv"
set "VENV_LINK=%~dp0backend\venv"

echo [2/4] Creating backend virtual environment...
cd backend
if not exist "venv\Scripts\python.exe" (
    REM Remove broken venv/junction if exists
    if exist "venv" (
        rmdir "venv" 2>nul
        if exist "venv" rd /s /q "venv"
    )
    REM Create venv outside OneDrive
    echo       Creating venv at %VENV_EXTERNAL% ^(outside OneDrive^)...
    if exist "%VENV_EXTERNAL%" rd /s /q "%VENV_EXTERNAL%"
    python -m venv "%VENV_EXTERNAL%"
    if !ERRORLEVEL! NEQ 0 (
        echo       [ERROR] Failed to create venv.
        echo       Make sure Python 3.11+ is installed and on PATH.
        pause
        exit /b 1
    )
    REM Create junction link
    mklink /J "venv" "%VENV_EXTERNAL%"
    if !ERRORLEVEL! NEQ 0 (
        echo       [WARNING] Could not create junction link.
        echo       Falling back to local venv...
        python -m venv venv
    )
    echo       Created venv.
) else (
    echo       venv already exists. Skipping.
)

echo [3/4] Installing backend dependencies...
echo       *** This takes 10-20 minutes on first run ^(PyTorch, spaCy, etc.^) ***
echo       *** Please wait - progress will show below ***
echo.
call venv\Scripts\activate.bat
pip install -e ".[dev]"
if !ERRORLEVEL! NEQ 0 (
    echo       [ERROR] pip install failed.
    echo       Make sure Python 3.11+ is installed.
    call deactivate
    pause
    exit /b 1
)
call deactivate
cd ..
echo       Backend setup complete.
echo.

REM --- Frontend setup ---
echo [4/4] Installing frontend dependencies...
cd frontend
call npm install --no-audit --no-fund
if !ERRORLEVEL! NEQ 0 (
    echo       [ERROR] npm install failed.
    echo       Make sure Node.js 20+ is installed.
    pause
    exit /b 1
)
cd ..
echo       Frontend setup complete.
echo.

echo ========================================
echo  Setup Complete!
echo ========================================
echo.
echo  Next steps:
echo    1. Edit .env file (set LLM API keys)
echo    2. Run start.bat to launch the app
echo.
endlocal
pause
