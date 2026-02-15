@echo off
echo ========================================
echo  NexusText AI v7.0 - Start
echo ========================================
echo.

cd /d "%~dp0"

REM --- Port settings (change if port conflicts) ---
set BACKEND_PORT=8002
set FRONTEND_PORT=5173

REM --- Virtual environment path ---
REM OneDrive外のvenvを優先（パフォーマンス向上）
if exist "C:\temp\text-mining-venv\Scripts\python.exe" (
    set VENV_PATH=C:\temp\text-mining-venv
) else if exist "backend\venv\Scripts\python.exe" (
    set VENV_PATH=%~dp0backend\venv
) else (
    echo [ERROR] Backend venv not found.
    echo         Run setup.bat first, or create venv at C:\temp\text-mining-venv
    pause
    exit /b 1
)
echo Using venv: %VENV_PATH%

if not exist "frontend\node_modules" (
    echo [ERROR] Frontend node_modules not found.
    echo         Run setup.bat first.
    pause
    exit /b 1
)

REM --- Start backend (new window) ---
echo [1/2] Starting backend... (http://localhost:%BACKEND_PORT%)
start "NexusText-Backend" cmd /k "cd /d %~dp0backend && call %VENV_PATH%\Scripts\activate.bat && echo. && echo === NexusText AI Backend === && echo http://localhost:%BACKEND_PORT% && echo API Docs: http://localhost:%BACKEND_PORT%/docs && echo. && uvicorn app.main:app --reload --host 127.0.0.1 --port %BACKEND_PORT%"

REM --- Wait for backend ---
timeout /t 3 /nobreak >nul

REM --- Start frontend (new window) ---
echo [2/2] Starting frontend... (http://localhost:%FRONTEND_PORT%)
start "NexusText-Frontend" cmd /k "cd /d %~dp0frontend && echo. && echo === NexusText AI Frontend === && echo http://localhost:%FRONTEND_PORT% && echo. && npm run dev -- --port %FRONTEND_PORT%"

echo.
echo ========================================
echo  Started!
echo ========================================
echo.
echo  Backend:  http://localhost:%BACKEND_PORT%
echo  API Docs: http://localhost:%BACKEND_PORT%/docs
echo  Frontend: http://localhost:%FRONTEND_PORT%
echo.
echo  Stop: close both server windows, or run stop.bat
echo.

REM --- Open browser after 5 seconds ---
timeout /t 5 /nobreak >nul
echo Opening browser...
start http://localhost:%FRONTEND_PORT%

pause
