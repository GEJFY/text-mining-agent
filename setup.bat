@echo off
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
echo [2/4] Creating backend virtual environment...
cd backend
if not exist "venv" (
    python -m venv venv
    if %ERRORLEVEL% NEQ 0 (
        echo       [ERROR] Failed to create venv.
        echo       Make sure Python 3.11 is installed and on PATH.
        pause
        exit /b 1
    )
    echo       Created venv.
) else (
    echo       venv already exists. Skipping.
)

echo [3/4] Installing backend dependencies...
echo       (This may take a few minutes on first run)
call venv\Scripts\activate.bat
pip install -e ".[dev]" --quiet
if %ERRORLEVEL% NEQ 0 (
    echo       [ERROR] pip install failed.
    echo       Make sure Python 3.11 is installed.
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
if %ERRORLEVEL% NEQ 0 (
    echo       [ERROR] npm install failed.
    echo       Make sure Node.js 20 is installed.
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
pause
