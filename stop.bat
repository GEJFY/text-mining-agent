@echo off
echo ========================================
echo  NexusText AI v7.0 - Stop
echo ========================================
echo.

echo Stopping backend (uvicorn)...
taskkill /f /im uvicorn.exe 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8002" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a 2>nul
)

echo Stopping frontend (node)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a 2>nul
)

echo.
echo All servers stopped.
pause
