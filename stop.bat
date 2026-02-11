@echo off
chcp 65001 >nul
echo ========================================
echo  NexusText AI v7.0 - 停止
echo ========================================
echo.

echo バックエンド (uvicorn) を停止しています...
taskkill /f /im uvicorn.exe 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a 2>nul
)

echo フロントエンド (node) を停止しています...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a 2>nul
)

echo.
echo 全サーバーを停止しました。
pause
