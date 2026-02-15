@echo off
echo ========================================
echo  NexusText AI v7.0 - Docker Start
echo ========================================
echo.

cd /d "%~dp0"

if not exist ".env" (
    echo Creating .env file...
    copy .env.example .env >nul
    echo Done. Edit .env if needed.
    echo.
)

echo Starting Docker Compose...
echo (First run may take several minutes to build images)
echo.

docker compose up -d --build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Docker Compose failed.
    echo         Make sure Docker Desktop is running.
    echo         If port conflict, edit .env to change port numbers.
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Docker Started!
echo ========================================
echo.
echo  Backend:    http://localhost:8002
echo  API Docs:   http://localhost:8002/docs
echo  Frontend:   http://localhost:3002
echo  PostgreSQL: localhost:15432
echo  Redis:      localhost:16379
echo.
echo  To stop: docker compose down
echo.

timeout /t 3 /nobreak >nul
start http://localhost:3002

pause
