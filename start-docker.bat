@echo off
chcp 65001 >nul
echo ========================================
echo  NexusText AI v7.0 - Docker起動
echo ========================================
echo.

cd /d "%~dp0"

REM --- .env チェック ---
if not exist ".env" (
    echo [準備] .env ファイルを作成しています...
    copy .env.example .env >nul
    echo       .env を作成しました。必要に応じて編集してください。
    echo.
)

REM --- Docker Compose 起動 ---
echo Docker Compose でサービスを起動しています...
echo （初回はイメージのビルドに数分かかります）
echo.

docker compose up -d --build

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [エラー] Docker Compose の起動に失敗しました。
    echo         Docker Desktop が起動しているか確認してください。
    pause
    exit /b 1
)

echo.
echo ========================================
echo  Docker起動完了！
echo ========================================
echo.
echo  バックエンド:    http://localhost:8000
echo  API ドキュメント:  http://localhost:8000/docs
echo  フロントエンド:  http://localhost:3000
echo  PostgreSQL:      localhost:5432
echo  Redis:           localhost:6379
echo.
echo  停止: docker compose down
echo.

timeout /t 3 /nobreak >nul
start http://localhost:3000

pause
