@echo off
chcp 65001 >nul
echo ========================================
echo  NexusText AI v7.0 - 初期セットアップ
echo ========================================
echo.

REM --- プロジェクトルートに移動 ---
cd /d "%~dp0"

REM --- .env ファイルの作成 ---
if not exist ".env" (
    echo [1/4] .env ファイルを作成しています...
    copy .env.example .env >nul
    echo       .env.example を .env にコピーしました。
    echo       必要に応じて .env を編集してください（LLM APIキー等）。
) else (
    echo [1/4] .env ファイルは既に存在します。スキップ。
)
echo.

REM --- バックエンドのセットアップ ---
echo [2/4] バックエンド仮想環境を作成しています...
cd backend
if not exist "venv" (
    python -m venv venv
    echo       venv を作成しました。
) else (
    echo       venv は既に存在します。スキップ。
)

echo [3/4] バックエンド依存パッケージをインストールしています...
echo       （初回は数分かかる場合があります）
call venv\Scripts\activate.bat
pip install -e ".[dev]" --quiet 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo       [警告] pip install でエラーが発生しました。
    echo       Python 3.11 がインストールされているか確認してください。
    pause
    exit /b 1
)
call deactivate
cd ..
echo       バックエンドのセットアップ完了。
echo.

REM --- フロントエンドのセットアップ ---
echo [4/4] フロントエンド依存パッケージをインストールしています...
cd frontend
call npm install --no-audit --no-fund --silent 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo       [警告] npm install でエラーが発生しました。
    echo       Node.js 20 がインストールされているか確認してください。
    pause
    exit /b 1
)
cd ..
echo       フロントエンドのセットアップ完了。
echo.

echo ========================================
echo  セットアップ完了！
echo ========================================
echo.
echo  次のステップ:
echo    1. .env ファイルを編集（LLM APIキーを設定）
echo    2. start.bat を実行してアプリを起動
echo.
pause
