@echo off
chcp 65001 >nul
echo ========================================
echo  NexusText AI v7.0 - 起動
echo ========================================
echo.

REM --- プロジェクトルートに移動 ---
cd /d "%~dp0"

REM --- 事前チェック ---
if not exist "backend\venv" (
    echo [エラー] バックエンドの仮想環境が見つかりません。
    echo         先に setup.bat を実行してください。
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo [エラー] フロントエンドの依存パッケージが見つかりません。
    echo         先に setup.bat を実行してください。
    pause
    exit /b 1
)

REM --- バックエンド起動（別ウィンドウ） ---
echo [1/2] バックエンドを起動しています... (http://localhost:8000)
start "NexusText AI - Backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && echo. && echo ====================================== && echo  NexusText AI - Backend Server && echo  http://localhost:8000 && echo  API Docs: http://localhost:8000/docs && echo ====================================== && echo. && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

REM --- 2秒待機（バックエンド起動待ち） ---
timeout /t 2 /nobreak >nul

REM --- フロントエンド起動（別ウィンドウ） ---
echo [2/2] フロントエンドを起動しています... (http://localhost:5173)
start "NexusText AI - Frontend" cmd /k "cd /d "%~dp0frontend" && echo. && echo ====================================== && echo  NexusText AI - Frontend Dev Server && echo  http://localhost:5173 && echo ====================================== && echo. && npm run dev"

echo.
echo ========================================
echo  起動完了！
echo ========================================
echo.
echo  バックエンド:  http://localhost:8000
echo  API ドキュメント: http://localhost:8000/docs
echo  フロントエンド: http://localhost:5173
echo.
echo  ※ 各サーバーは別ウィンドウで起動しています。
echo  ※ 停止するには各ウィンドウで Ctrl+C を押してください。
echo.

REM --- 3秒後にブラウザを開く ---
timeout /t 3 /nobreak >nul
echo ブラウザを開いています...
start http://localhost:5173

pause
