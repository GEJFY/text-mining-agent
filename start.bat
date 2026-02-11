@echo off
echo ========================================
echo  NexusText AI v7.0 - Start
echo ========================================
echo.

cd /d "%~dp0"

REM --- Pre-flight checks ---
if not exist "backend\venv" (
    echo [ERROR] Backend venv not found.
    echo         Run setup.bat first.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo [ERROR] Frontend node_modules not found.
    echo         Run setup.bat first.
    pause
    exit /b 1
)

REM --- Start backend (new window) ---
echo [1/2] Starting backend... (http://localhost:8000)
start "NexusText-Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate.bat && echo. && echo === NexusText AI Backend === && echo http://localhost:8000 && echo API Docs: http://localhost:8000/docs && echo. && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

REM --- Wait for backend ---
timeout /t 2 /nobreak >nul

REM --- Start frontend (new window) ---
echo [2/2] Starting frontend... (http://localhost:5173)
start "NexusText-Frontend" cmd /k "cd /d %~dp0frontend && echo. && echo === NexusText AI Frontend === && echo http://localhost:5173 && echo. && npm run dev"

echo.
echo ========================================
echo  Started!
echo ========================================
echo.
echo  Backend:  http://localhost:8000
echo  API Docs: http://localhost:8000/docs
echo  Frontend: http://localhost:5173
echo.
echo  Stop: close both server windows, or run stop.bat
echo.

REM --- Open browser after 3 seconds ---
timeout /t 3 /nobreak >nul
echo Opening browser...
start http://localhost:5173

pause
