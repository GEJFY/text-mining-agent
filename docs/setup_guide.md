# NexusText AI v7.0 - セットアップガイド

> **対象読者**: 開発環境の構築が初めての方を含む、すべてのユーザー
> **最終更新日**: 2026年2月23日
> **対応OS**: Windows 10 / Windows 11（本ガイドはWindows 11を基準に記述）

---

## 目次

1. [はじめに](#はじめに)
2. [方法1: ローカル環境構築（推奨：初めての方）](#方法1-ローカル環境構築推奨初めての方)
3. [方法2: Docker環境構築（推奨：手軽に始めたい方）](#方法2-docker環境構築推奨手軽に始めたい方)
4. [方法3: クラウドデプロイ（本番環境）](#方法3-クラウドデプロイ本番環境)
5. [環境変数リファレンス](#環境変数リファレンス)
6. [LLM APIキーの取得方法](#llm-apiキーの取得方法)
7. [よくあるエラーと解決方法](#よくあるエラーと解決方法)
8. [付録: VS Code推奨拡張機能](#付録-vs-code推奨拡張機能)

---

## はじめに

### NexusText AI とは

NexusText AI v7.0 は、テキストマイニングに特化した **多言語・マルチモーダル解析プラットフォーム** です。大規模言語モデル（LLM）を中核に据え、以下の解析機能を統合的に提供します。

- **クラスタリング分析**: テキストデータを意味的に類似したグループに自動分類
- **感情分析（センチメント分析）**: テキスト中の感情やトーンを定量的に評価
- **共起ネットワーク分析**: 単語同士の出現パターンを可視化し、関係性を発見
- **AIエージェント**: 自律的にデータを分析し、インサイトを提示（Human-in-the-Loop対応）
- **レポート自動生成**: 分析結果をPDF・HTML・DOCX・PPTXで出力

**アーキテクチャの概要**:

```
┌───────────────────────────────────────────────────┐
│  フロントエンド (React 18 + TypeScript + Vite)      │
│  - インタラクティブな分析キャンバス                     │
│  - ノーコード分析フローデザイナー                       │
│  - ダッシュボードビルダー                              │
├───────────────────────────────────────────────────┤
│  APIゲートウェイ (クラウドネイティブ)                    │
│  AWS: API Gateway │ Azure: APIM │ GCP: Endpoints  │
├───────────────────────────────────────────────────┤
│  バックエンド (FastAPI / Python 3.11)               │
│  - LLMオーケストレーション (マルチモデルルーティング)      │
│  - テキストマイニングエンジン                           │
│  - 自律型エージェント (HITL)                           │
│  - レポート生成エンジン                                │
├───────────────────────────────────────────────────┤
│  データベース                                         │
│  PostgreSQL 16 │ Redis 7                           │
├───────────────────────────────────────────────────┤
│  インフラストラクチャ (Terraform マルチクラウド)          │
│  AWS / Azure / GCP / ローカル Docker                │
└───────────────────────────────────────────────────┘
```

### システム要件

#### 最低要件（ローカル開発環境）

| 項目 | 要件 |
|------|------|
| **OS** | Windows 10 (64bit) 以上 / macOS 12 以上 / Ubuntu 22.04 以上 |
| **CPU** | 4コア以上（Intel Core i5 / AMD Ryzen 5 相当以上） |
| **メモリ** | 16GB 以上（Embeddingモデルのロードに必要） |
| **ディスク空き容量** | 20GB 以上 |
| **インターネット接続** | 必須（LLM APIの呼び出し、パッケージのダウンロードに使用） |

#### 推奨要件

| 項目 | 要件 |
|------|------|
| **OS** | Windows 11 (64bit) |
| **CPU** | 8コア以上（Intel Core i7 / AMD Ryzen 7 相当以上） |
| **メモリ** | 32GB 以上 |
| **ディスク空き容量** | 50GB 以上（SSD推奨） |
| **GPU** | CUDA対応GPU（任意。ローカルEmbeddingの高速化に使用） |

#### 必要なソフトウェア

| ソフトウェア | バージョン | 用途 |
|------------|-----------|------|
| Python | 3.11 以上 | バックエンド実行環境 |
| Node.js | 20 LTS 以上 | フロントエンド実行環境 |
| Git | 最新版 | ソースコード管理 |
| PostgreSQL | 16 以上 | データベース |
| Redis | 7 以上 | キャッシュ・セッション・タスクキュー |

> **注意**: Docker環境で構築する場合（方法2）は、Docker Desktopのみで構築できます。Python、Node.js、PostgreSQL、Redisの個別インストールは不要です。

---

## 方法1: ローカル環境構築（推奨：初めての方）

この方法では、各ソフトウェアを個別にインストールして開発環境を構築します。時間はかかりますが、各コンポーネントの仕組みを理解できるため、初めての方にはこの方法を推奨します。

---

### 1. 前提ソフトウェアのインストール

#### 1-1. Python 3.11 のインストール

Python は、NexusText AI のバックエンド（サーバー側プログラム）を動かすために必要なプログラミング言語です。

**手順**:

1. **Pythonの公式サイトにアクセス**

   ブラウザで以下のURLを開きます:
   ```
   https://www.python.org/downloads/
   ```

2. **Python 3.11 系の最新版をダウンロード**

   ページ上部に「Download Python 3.x.x」というボタンが表示されますが、**3.11系**を使う必要があります。ページを下にスクロールして「Python 3.11.x」（xは最新の数字）を見つけ、「Download」をクリックしてください。

   具体的には、ダウンロードページの一覧から「Python 3.11.11」などの行を探し、リンクをクリックします。次のページで「Windows installer (64-bit)」をクリックしてインストーラー（`.exe`ファイル）をダウンロードしてください。

3. **インストーラーを実行**

   ダウンロードした `.exe` ファイルをダブルクリックします。

   **ここが最も重要です**: インストーラーの最初の画面で、画面下部にある以下の2つのチェックボックスを **必ず** オンにしてください。

   ```
   [x] Use admin privileges when installing py.exe
   [x] Add python.exe to PATH    <-- これが特に重要！
   ```

   > **「Add python.exe to PATH」とは？**
   > PATHとは、Windowsが「コマンドプロンプトやPowerShellで入力されたコマンドを、どのフォルダから探すか」を決める設定です。これにチェックを入れないと、`python`コマンドを入力しても「そんなコマンドは見つかりません」とエラーになります。

   チェックを入れたら、「Install Now」をクリックしてインストールを開始します。

4. **インストール完了の確認**

   インストールが完了したら、「Close」をクリックしてインストーラーを閉じます。

5. **インストールの確認（PowerShellを使用）**

   Windowsキーを押して「PowerShell」と入力し、「Windows PowerShell」を開きます。以下のコマンドを入力してEnterを押してください。

   ```powershell
   python --version
   ```

   **期待される出力**:
   ```
   Python 3.11.11
   ```
   （バージョン番号の末尾は異なる場合があります。「3.11」で始まっていればOKです。）

   次に、pipが正しくインストールされていることも確認します:

   ```powershell
   pip --version
   ```

   **期待される出力**:
   ```
   pip 24.3.1 from C:\Users\<ユーザー名>\AppData\Local\Programs\Python\Python311\Lib\site-packages\pip (python 3.11)
   ```

   > **うまくいかない場合**: 「'python' は、内部コマンドまたは外部コマンド...として認識されていません」と表示された場合は、PATHの設定がされていません。Pythonを一度アンインストールして、「Add python.exe to PATH」にチェックを入れてやり直してください。

---

#### 1-2. Node.js 20 のインストール

Node.js は、NexusText AI のフロントエンド（ブラウザに表示される画面部分）の開発とビルドに必要です。

**手順**:

1. **Node.jsの公式サイトにアクセス**

   ブラウザで以下のURLを開きます:
   ```
   https://nodejs.org/ja
   ```

2. **LTS版をダウンロード**

   トップページに「LTS（推奨版）」と書かれた緑色のボタンがあります。バージョンが「20.x.x」以上であることを確認して、クリックしてダウンロードしてください。

   > **LTSとは？**: Long Term Support（長期サポート）の略です。安定しており、長期間のセキュリティアップデートが保証されています。最新機能が欲しい場合でも、必ずLTS版を選んでください。

3. **インストーラーを実行**

   ダウンロードした `.msi` ファイルをダブルクリックします。

   - 「Welcome to the Node.js Setup Wizard」画面で「Next」をクリック
   - ライセンス契約に同意（チェックを入れて「Next」）
   - インストール先はデフォルトのままで「Next」
   - カスタムセットアップもデフォルトのままで「Next」
   - 「Automatically install the necessary tools...」のチェックボックスは**オフのまま**で「Next」
   - 「Install」をクリック

4. **インストールの確認**

   PowerShellを**新しく開き直して**（既に開いている場合は閉じて開き直す）、以下を入力します:

   ```powershell
   node --version
   ```

   **期待される出力**:
   ```
   v20.18.2
   ```
   （バージョン番号は異なる場合があります。「v20」以上であればOKです。）

   npmも確認します:

   ```powershell
   npm --version
   ```

   **期待される出力**:
   ```
   10.8.2
   ```

---

#### 1-3. Git のインストール

Git は、ソースコード（プログラムの元データ）のバージョン管理を行うツールです。プロジェクトのソースコードをダウンロード（クローン）するために使用します。

**手順**:

1. **Gitの公式サイトにアクセス**

   ```
   https://git-scm.com/downloads/win
   ```

2. **インストーラーをダウンロード**

   「64-bit Git for Windows Setup」をクリックしてダウンロードします。

3. **インストーラーを実行**

   ダウンロードした `.exe` ファイルをダブルクリックします。設定画面が多数表示されますが、基本的にすべてデフォルトのまま「Next」をクリックしていけば問題ありません。

   ただし、以下の画面では注意してください:

   - **「Choosing the default editor used by Git」**（Gitが使うテキストエディタの選択）: ドロップダウンから「Use Visual Studio Code as Git's default editor」を選ぶと便利です（VS Codeがインストール済みの場合）
   - **「Adjusting the name of the initial branch」**: 「Override the default branch name for new repositories」を選び、「main」と入力することを推奨します
   - **「Adjusting your PATH environment」**: 「Git from the command line and also from 3rd-party software」（推奨、デフォルト）が選ばれていることを確認

4. **インストールの確認**

   PowerShellを新しく開き直して:

   ```powershell
   git --version
   ```

   **期待される出力**:
   ```
   git version 2.47.1.windows.2
   ```

5. **Gitの初期設定**

   Gitを使う前に、ユーザー名とメールアドレスを設定する必要があります。これは、誰がコードを変更したかを記録するためです。

   ```powershell
   git config --global user.name "あなたの名前"
   git config --global user.email "あなたのメールアドレス@example.com"
   ```

   例:
   ```powershell
   git config --global user.name "Taro Yamada"
   git config --global user.email "taro.yamada@example.com"
   ```

   設定を確認するには:
   ```powershell
   git config --global --list
   ```

   **期待される出力**:
   ```
   user.name=Taro Yamada
   user.email=taro.yamada@example.com
   ```

---

#### 1-4. PostgreSQL 16 のインストール

PostgreSQL は、NexusText AI がデータを保存するためのデータベースです。分析対象のテキストデータ、分析結果、ユーザー情報などがここに格納されます。

**手順**:

1. **PostgreSQLの公式サイトにアクセス**

   ```
   https://www.postgresql.org/download/windows/
   ```

2. **インストーラーをダウンロード**

   「Download the installer」のリンクをクリックすると、EDB社のダウンロードページに移動します。PostgreSQL 16の行から「Windows x86-64」のダウンロードボタンをクリックしてください。

3. **インストーラーを実行**

   ダウンロードした `.exe` ファイルをダブルクリックします。

   - **インストール先**: デフォルトのまま（`C:\Program Files\PostgreSQL\16`）
   - **コンポーネントの選択**: すべてチェックが入った状態のまま「Next」
   - **データディレクトリ**: デフォルトのまま
   - **パスワードの設定**: **ここが重要です！** スーパーユーザー（postgres）のパスワードを設定します。このパスワードは後で必要になるので、メモしておいてください。例: `postgres123`

     > **注意**: 本番環境では強力なパスワードを使用してください。開発環境では覚えやすいパスワードで構いません。

   - **ポート番号**: デフォルトの `5432` のまま
   - **ロケール**: デフォルト（または「Japanese, Japan」）
   - 「Next」をクリックしてインストールを開始

4. **Stack Builderの起動**: インストール完了時に「Launch Stack Builder at exit?」というチェックボックスが表示されますが、チェックを**外して**「Finish」をクリックしてください。

5. **PATHの設定**

   PostgreSQLのコマンドラインツールをPowerShellから使えるようにするため、PATHに追加します。

   PowerShellを**管理者として実行**し（PowerShellを右クリック→「管理者として実行」）、以下を入力します:

   ```powershell
   [Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\Program Files\PostgreSQL\16\bin", "User")
   ```

   PowerShellを閉じて開き直します。

6. **インストールの確認**

   ```powershell
   psql --version
   ```

   **期待される出力**:
   ```
   psql (PostgreSQL) 16.6
   ```

7. **NexusText AI用のデータベースとユーザーを作成**

   以下のコマンドでPostgreSQLに接続します。パスワードを求められたら、インストール時に設定したパスワード（例: `postgres123`）を入力してください。

   ```powershell
   psql -U postgres
   ```

   **期待される出力**:
   ```
   psql (16.6)
   WARNING: Console code page (932) differs from Windows code page (65001)
            8 bit characters might not work correctly.
   Type "help" for help.

   postgres=#
   ```

   `postgres=#` というプロンプトが表示されたら、PostgreSQLに接続できています。以下のSQLコマンドを1行ずつ入力してEnterを押してください。

   ```sql
   CREATE USER nexustext WITH PASSWORD 'nexustext';
   ```

   **期待される出力**: `CREATE ROLE`

   ```sql
   CREATE DATABASE nexustext OWNER nexustext;
   ```

   **期待される出力**: `CREATE DATABASE`

   ```sql
   GRANT ALL PRIVILEGES ON DATABASE nexustext TO nexustext;
   ```

   **期待される出力**: `GRANT`

   PostgreSQLから抜けます:

   ```sql
   \q
   ```

8. **接続テスト**

   作成したユーザーでデータベースに接続できることを確認します:

   ```powershell
   psql -U nexustext -d nexustext
   ```

   パスワード: `nexustext`

   `nexustext=>` と表示されれば成功です。`\q` で抜けてください。

---

#### 1-5. Redis のインストール

Redis は、高速なインメモリデータストアです。NexusText AI では、キャッシュ（頻繁にアクセスするデータの一時保存）、セッション管理、タスクキュー（処理の順番待ち）に使用します。

> **注意**: Redis は公式にはLinux向けのソフトウェアです。Windowsで使うには、いくつかの方法があります。ここでは2つの方法を紹介します。

**方法A: Memuraiを使う（推奨・簡単）**

Memuraiは、Windows向けに作られたRedis互換のソフトウェアです。

1. **Memuraiの公式サイトにアクセス**

   ```
   https://www.memurai.com/get-memurai
   ```

2. **ダウンロードとインストール**

   「Memurai Developer」（無料版）をダウンロードしてインストールします。インストーラーの指示に従ってデフォルト設定のまま進めてください。

3. **サービスの確認**

   Memuraiはインストール後に自動的にWindowsサービスとして起動します。確認するには:

   ```powershell
   memurai-cli ping
   ```

   **期待される出力**:
   ```
   PONG
   ```

**方法B: WSL2を使う（Linux環境の経験がある方向け）**

WSL2（Windows Subsystem for Linux）を使って、Linux版のRedisをWindowsで動かす方法です。

1. **WSL2の有効化**

   PowerShellを管理者として実行し:

   ```powershell
   wsl --install
   ```

   PCを再起動してください。再起動後、Ubuntuのセットアップ画面が表示されるので、ユーザー名とパスワードを設定します。

2. **WSL2内でRedisをインストール**

   WSL2のUbuntuターミナルを開いて:

   ```bash
   sudo apt update
   sudo apt install redis-server -y
   ```

3. **Redisを起動**

   ```bash
   sudo service redis-server start
   ```

4. **接続テスト**

   ```bash
   redis-cli ping
   ```

   **期待される出力**: `PONG`

> **どちらを選ぶべきか？**: Windowsに慣れている方はMemurai（方法A）が簡単です。Linuxの経験がある方や、将来的にLinux環境も使いたい方はWSL2（方法B）が良いでしょう。

---

### 2. リポジトリのクローン

「リポジトリのクローン」とは、サーバー上にあるプロジェクトのソースコード一式をお使いのPCにコピーすることです。

**手順**:

1. **作業ディレクトリに移動**

   PowerShellを開いて、ソースコードを保存したい場所に移動します。ここでは例としてドキュメントフォルダに保存します:

   ```powershell
   cd $HOME\Documents
   ```

2. **リポジトリをクローン**

   ```powershell
   git clone https://github.com/your-organization/text-mining-agent.git
   ```

   > **注意**: 上記のURLはサンプルです。実際のリポジトリURLは、プロジェクト管理者から提供されたURLに置き換えてください。

   **期待される出力**:
   ```
   Cloning into 'text-mining-agent'...
   remote: Enumerating objects: 150, done.
   remote: Counting objects: 100% (150/150), done.
   remote: Compressing objects: 100% (120/120), done.
   remote: Total 150 (delta 45), reused 100 (delta 25)
   Receiving objects: 100% (150/150), 250.00 KiB | 1.50 MiB/s, done.
   Resolving deltas: 100% (45/45), done.
   ```

3. **プロジェクトフォルダに移動**

   ```powershell
   cd text-mining-agent
   ```

4. **プロジェクト構成の確認**

   ```powershell
   dir
   ```

   **期待される出力**（主要ファイル・フォルダ）:
   ```
   Mode                 LastWriteTime         Length Name
   ----                 -------------         ------ ----
   d-----        2026/02/12    10:00                .github
   d-----        2026/02/12    10:00                backend
   d-----        2026/02/12    10:00                docs
   d-----        2026/02/12    10:00                frontend
   d-----        2026/02/12    10:00                infra
   -a----        2026/02/12    10:00           2500 .env.example
   -a----        2026/02/12    10:00           3500 docker-compose.yml
   -a----        2026/02/12    10:00           1800 README.md
   ```

---

### 3. バックエンドのセットアップ

バックエンドとは、ブラウザから見えない裏側で動作するサーバープログラムのことです。データの処理、AI分析、API提供などを担当します。

#### 3-1. 仮想環境の作成

「仮想環境」とは、プロジェクト専用のPythonパッケージ置き場を作ることです。他のプロジェクトとパッケージのバージョンが競合しないようにするための仕組みです。

```powershell
cd backend
```

仮想環境を作成します:

```powershell
python -m venv .venv
```

> **OneDriveを使用している場合の注意**: OneDriveの同期が有効なフォルダでは、仮想環境（`.venv`）の作成中に同期の競合が発生することがあります。その場合は、一時的にOneDriveの同期を停止してから実行してください。
>
> 同期の停止方法: タスクバー右下のOneDriveアイコンを右クリック→「同期の一時停止」→「24時間」を選択

**期待される出力**: 何も表示されなければ成功です。`.venv` フォルダが作成されています。

仮想環境を有効化します:

```powershell
.venv\Scripts\Activate.ps1
```

> **PowerShellでスクリプト実行がブロックされた場合**:
> 「このシステムではスクリプトの実行が無効になっています」と表示された場合、以下を管理者権限のPowerShellで実行してください:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> その後、再度 `.venv\Scripts\Activate.ps1` を実行してください。

**期待される出力**: プロンプトの先頭に `(.venv)` が表示されます:
```
(.venv) PS C:\...\text-mining-agent\backend>
```

#### 3-2. パッケージのインストール

NexusText AI のバックエンドが依存するPythonパッケージをインストールします。

```powershell
pip install --upgrade pip setuptools wheel
```

```powershell
pip install -e ".[dev]"
```

> **`-e ".[dev]"` の意味**:
> - `-e`: 「編集可能モード」でインストール。ソースコードを変更するとすぐに反映されます
> - `.`: 現在のフォルダの `pyproject.toml` を参照
> - `[dev]`: 開発用の追加パッケージ（テストツール、コード品質チェックツールなど）も含める

このコマンドは、以下のような多数のパッケージをダウンロード・インストールします（インターネット速度によりますが、初回は5〜15分程度かかります）:

- **Web フレームワーク**: FastAPI, Uvicorn
- **LLM クライアント**: anthropic, openai, google-cloud-aiplatform, langchain
- **テキストマイニング**: scikit-learn, hdbscan, umap-learn, sentence-transformers, bertopic, spacy
- **日本語形態素解析**: fugashi, unidic-lite
- **データ処理**: pandas, numpy, openpyxl, pdfplumber
- **レポート生成**: python-pptx, reportlab, jinja2
- **セキュリティ**: python-jose, passlib, presidio-analyzer
- **データベース**: sqlalchemy, asyncpg, alembic, redis
- **監視**: structlog, opentelemetry, prometheus-client
- **開発ツール**: pytest, ruff, mypy, pre-commit

**期待される出力の末尾**:
```
Successfully installed ... (多数のパッケージ名が表示されます)
```

> **エラーが出た場合**: 「Microsoft Visual C++ 14.0 or greater is required」というエラーが出る場合は、Microsoft C++ Build Toolsのインストールが必要です。[よくあるエラーと解決方法](#よくあるエラーと解決方法)を参照してください。

#### 3-3. spaCyの日本語モデルのダウンロード

NexusText AI は日本語テキストの処理にspaCyを使用します。spaCy用の日本語モデルを追加でダウンロードする必要があります:

```powershell
python -m spacy download ja_core_news_sm
```

**期待される出力の末尾**:
```
✔ Download and installation successful
You can now load the package via spacy.load('ja_core_news_sm')
```

#### 3-4. 環境変数ファイル（.env）の作成

環境変数ファイルは、APIキーやデータベースの接続情報など、環境ごとに異なる設定値を管理するファイルです。セキュリティのため、このファイルはGitで管理しません。

プロジェクトルートに戻ります:

```powershell
cd ..
```

テンプレートファイルをコピーして `.env` ファイルを作成します:

```powershell
Copy-Item .env.example .env
```

テキストエディタ（VS Codeなど）で `.env` ファイルを開き、以下の項目を編集します:

```powershell
code .env
```

**各環境変数の説明と設定方法**:

```env
# === アプリケーション基本設定 ===

# アプリケーション名（変更不要）
NEXUSTEXT_APP_NAME=NexusText AI

# アプリケーションバージョン（変更不要）
NEXUSTEXT_APP_VERSION=7.0.0

# デバッグモード（開発中は true にしておく）
# true にすると詳細なエラー情報が表示されます
NEXUSTEXT_DEBUG=true

# ログレベル（開発中は INFO または DEBUG が便利）
# 選択肢: DEBUG / INFO / WARNING / ERROR
NEXUSTEXT_LOG_LEVEL=INFO

# === クラウドプロバイダー ===
# ローカル開発では "local" のまま
NEXUSTEXT_CLOUD_PROVIDER=local

# === CORS設定 ===
# フロントエンドからバックエンドへのアクセスを許可するURL
# ローカル開発ではデフォルトのまま
NEXUSTEXT_CORS_ORIGINS=["http://localhost:3000","http://localhost:5173","http://localhost:8000"]

# === データベース（PostgreSQL）===
# 前のステップで作成したデータベースの接続情報
# 形式: postgresql+asyncpg://ユーザー名:パスワード@ホスト:ポート/データベース名
NEXUSTEXT_DATABASE_URL=postgresql+asyncpg://nexustext:nexustext@localhost:5432/nexustext

# === Redis ===
# Memuraiまたは WSL2のRedisの接続情報
NEXUSTEXT_REDIS_URL=redis://localhost:6379/0

# === LLM APIキー ===
# 以下は最低1つ設定してください（取得方法は後述の「LLM APIキーの取得方法」を参照）

# Anthropic Claude（推奨: メインのLLMとして使用）
NEXUSTEXT_ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# OpenAI
NEXUSTEXT_OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google Cloud（Vertex AI を使用する場合）
NEXUSTEXT_GOOGLE_CLOUD_PROJECT=your-gcp-project-id

# === LLMモデル設定 ===
# 使用するモデルの指定（デフォルトのまま利用可能）
NEXUSTEXT_PRIMARY_MODEL=claude-opus-4-6
NEXUSTEXT_SECONDARY_MODEL=claude-sonnet-4-5-20250929
NEXUSTEXT_PII_DETECTION_MODEL=gpt-5-mini
NEXUSTEXT_MULTILINGUAL_MODEL=gpt-5.1-chat
NEXUSTEXT_VISION_MODEL=gemini-3.0-pro
NEXUSTEXT_LOCAL_MODEL=llama-4-405b

# === Embedding設定 ===
# テキストをベクトル（数値の配列）に変換するためのモデル
# デフォルトのままで日本語に対応
NEXUSTEXT_EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
NEXUSTEXT_EMBEDDING_DIMENSION=384

# === セキュリティ / JWT ===
# SECRET_KEY: 認証トークンの署名に使うランダムな文字列
# 開発環境ではデフォルトのままでもOKですが、本番環境では必ず変更してください
NEXUSTEXT_SECRET_KEY=change-me-in-production-use-openssl-rand-hex-64

# JWT設定（変更不要）
NEXUSTEXT_JWT_ALGORITHM=HS256
NEXUSTEXT_JWT_EXPIRATION_MINUTES=60

# === エージェント設定 ===
# AIエージェントの自律性レベル
# full_auto: 完全自動（人間の承認なしに分析を進める）
# semi_auto: 半自動（重要な判断時に人間の承認を求める）← 推奨
# guided: ガイド付き（各ステップで人間の指示を待つ）
NEXUSTEXT_DEFAULT_HITL_MODE=semi_auto
```

> **重要**: `.env` ファイルには秘密情報（APIキーなど）が含まれます。絶対にGitにコミットしたり、他人に共有したりしないでください。`.gitignore` に `.env` が記載されていることを確認してください。

#### 3-5. データベースの初期化（マイグレーション）

データベースにNexusText AI用のテーブル（データの入れ物）を作成します。backendフォルダに移動して実行します:

```powershell
cd backend
```

```powershell
python -m alembic upgrade head
```

**期待される出力**:
```
INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.
INFO  [alembic.runtime.migration] Will assume transactional DDL.
INFO  [alembic.runtime.migration] Running upgrade  -> xxxx, initial migration
INFO  [alembic.runtime.migration] Running upgrade xxxx -> yyyy, add analysis tables
```

> **注意**: Alembicのマイグレーションファイルがまだ作成されていない場合は、この手順はスキップしてください。バックエンドを初回起動した際に、SQLAlchemyが自動的にテーブルを作成する場合もあります。

---

### 4. フロントエンドのセットアップ

フロントエンドとは、ブラウザに表示される画面部分のことです。React（リアクト）というJavaScriptライブラリを使って構築されています。

#### 4-1. パッケージのインストール

プロジェクトルートに戻り、frontendフォルダに移動します:

```powershell
cd ..\frontend
```

npm（Node Package Manager）を使って必要なパッケージをインストールします:

```powershell
npm install
```

**期待される出力**:
```
added 350 packages, and audited 351 packages in 25s

120 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

> **注意**: `npm warn` メッセージが表示される場合がありますが、通常は無視して問題ありません。`vulnerabilities`（脆弱性）が0でない場合は、`npm audit fix` を実行してください。

このコマンドにより、以下のような主要パッケージがインストールされます:

- **React 18**: ユーザーインターフェースの構築
- **React Router DOM**: ページ間のナビゲーション
- **TanStack React Query**: サーバーデータの取得・キャッシュ管理
- **Recharts + D3**: データの可視化（グラフ・チャート）
- **Zustand**: 状態管理（アプリ全体のデータの管理）
- **Axios**: バックエンドAPIとの通信
- **Radix UI**: アクセシブルなUIコンポーネント
- **Tailwind CSS**: ユーティリティファーストのCSSフレームワーク
- **TypeScript**: 型安全なJavaScript
- **Vite**: 高速な開発サーバー・ビルドツール

#### 4-2. 環境設定の確認

フロントエンドの環境設定は `vite.config.ts` で管理されています。開発サーバーのポートは `5173`、バックエンドAPIへのプロキシ設定は自動的に `http://localhost:8000` に転送されるため、通常は変更不要です。

設定内容の確認（参考）:

```typescript
// vite.config.ts の主要部分
export default defineConfig({
  server: {
    port: 5173,                      // 開発サーバーのポート
    proxy: {
      "/api": {
        target: "http://localhost:8000",  // バックエンドAPIの転送先
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: "ws://localhost:8000",    // WebSocket接続の転送先
        ws: true,
      },
    },
  },
});
```

---

### 5. 起動と動作確認

すべてのセットアップが完了したら、NexusText AI を起動して動作を確認しましょう。

#### 5-1. バックエンドの起動

PowerShellの新しいタブまたはウィンドウを開き、バックエンドを起動します:

```powershell
cd <プロジェクトのパス>\text-mining-agent\backend
.venv\Scripts\Activate.ps1
```

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **各オプションの意味**:
> - `app.main:app`: `app`フォルダ内の`main.py`ファイルにある`app`オブジェクトを起動
> - `--reload`: ソースコードの変更を検知して自動的に再起動（開発時に便利）
> - `--host 0.0.0.0`: すべてのネットワークインターフェースで待ち受け
> - `--port 8000`: ポート8000番で起動

**期待される出力**:
```
INFO:     Will watch for changes in these directories: ['C:\\...\\backend']
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process [12345] using StatReload
INFO:     Started server process [12346]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

> **注意**: このウィンドウは閉じないでください。バックエンドサーバーが動作し続けます。

#### 5-2. フロントエンドの起動

PowerShellの**別の新しいタブまたはウィンドウ**を開き、フロントエンドを起動します:

```powershell
cd <プロジェクトのパス>\text-mining-agent\frontend
npm run dev
```

**期待される出力**:
```
  VITE v6.0.1  ready in 500 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
  ➜  press h + enter to show help
```

#### 5-3. ヘルスチェック（動作確認）

ブラウザで以下のURLにアクセスして、バックエンドが正常に動作していることを確認します:

```
http://localhost:8000/health
```

**期待されるレスポンス（ブラウザに表示される内容）**:
```json
{
  "status": "healthy",
  "version": "7.0.0",
  "cloud_provider": "local"
}
```

また、FastAPIが自動生成するAPIドキュメントも確認できます:

```
http://localhost:8000/docs
```

このページでは、NexusText AI が提供するすべてのAPIエンドポイントの一覧と、各APIの詳細な仕様を確認できます。各エンドポイントを直接テストすることも可能です。

#### 5-4. ダッシュボードにアクセス

ブラウザで以下のURLにアクセスすると、NexusText AI のダッシュボードが表示されます:

```
http://localhost:5173/
```

正常に動作していれば、NexusText AI のメインダッシュボード画面が表示されます。左側にナビゲーションメニューがあり、以下の画面にアクセスできます:

- **ダッシュボード**: KPIサマリーと最近のアクティビティ
- **データインポート**: テキストデータのアップロード（CSV、Excel、PDF、DOCX対応）
- **クラスタリング**: テキストのグループ分け分析
- **センチメント**: 感情分析
- **共起ネットワーク**: 単語の関係性可視化

#### 5-5. 停止方法

各サーバーを停止するには、それぞれのPowerShellウィンドウで `Ctrl + C` を押します。

---

## 方法2: Docker環境構築（推奨：手軽に始めたい方）

Dockerを使うと、Python、Node.js、PostgreSQL、Redisなどのソフトウェアを個別にインストールする必要がありません。すべてのサービスが独立したコンテナ（仮想的な箱）として動作します。

### 前提条件

- Git がインストール済みであること（[1-3. Gitのインストール](#1-3-git-のインストール)を参照）

### 1. Docker Desktop のインストール

1. **Docker Desktop の公式サイトにアクセス**

   ```
   https://www.docker.com/products/docker-desktop/
   ```

2. **インストーラーをダウンロード**

   「Download for Windows」ボタンをクリックしてダウンロードします。

3. **インストーラーを実行**

   ダウンロードした `.exe` ファイルをダブルクリックします。

   - 「Use WSL 2 instead of Hyper-V」にチェックが入っていることを確認
   - 「Add shortcut to desktop」は任意
   - 「OK」をクリックしてインストール開始

   > **WSL 2 が未インストールの場合**: Docker Desktop のインストーラーが自動的にWSL 2のインストールを促します。表示される指示に従ってください。PCの再起動が必要になる場合があります。

4. **初回起動と設定**

   インストール完了後、Docker Desktop を起動します。初回はライセンス契約の同意が求められます。

   Docker Desktop が起動したら、画面下部のステータスバーに「Docker Desktop is running」と表示されるのを待ちます。

5. **インストールの確認**

   PowerShellを開いて:

   ```powershell
   docker --version
   ```

   **期待される出力**:
   ```
   Docker version 27.4.0, build bde2b89
   ```

   ```powershell
   docker compose version
   ```

   **期待される出力**:
   ```
   Docker Compose version v2.31.0
   ```

### 2. リポジトリのクローンと環境変数の準備

```powershell
cd $HOME\Documents
git clone https://github.com/your-organization/text-mining-agent.git
cd text-mining-agent
```

環境変数ファイルを準備します:

```powershell
Copy-Item .env.example .env
```

`.env` ファイルをテキストエディタで開き、**最低限LLMのAPIキーを設定**してください。データベースとRedisの設定はDocker Composeが自動的に行うため、変更不要です。

```powershell
code .env
```

以下の行を実際のAPIキーに変更します:
```env
NEXUSTEXT_ANTHROPIC_API_KEY=sk-ant-あなたの実際のAPIキー
NEXUSTEXT_OPENAI_API_KEY=sk-あなたの実際のAPIキー
```

### 3. Docker Compose でサービスを起動

すべてのサービスを一括で起動します:

```powershell
docker compose up -d
```

> **`-d` フラグの意味**: 「デタッチモード」で起動します。バックグラウンドで動作するため、PowerShellの画面が占有されません。

**初回起動時の出力例**:
```
[+] Building 120.5s (25/25) FINISHED
 => [backend builder 1/5] FROM docker.io/library/python:3.11-slim@sha256:...
 => [backend builder 2/5] RUN apt-get update && apt-get install -y ...
 => [backend builder 3/5] RUN pip install --no-cache-dir --upgrade pip ...
 => [backend builder 4/5] COPY pyproject.toml ./
 => [backend builder 5/5] RUN pip install --no-cache-dir --prefix=/install .
 => [backend runtime 1/8] FROM docker.io/library/python:3.11-slim@sha256:...
 ...
[+] Running 5/5
 ✔ Network nexustext-network     Created
 ✔ Container nexustext-postgres   Started
 ✔ Container nexustext-redis      Started
 ✔ Container nexustext-backend    Started
 ✔ Container nexustext-frontend   Started
```

> **注意**: 初回はDockerイメージのビルドが必要なため、5〜20分程度かかる場合があります。2回目以降はキャッシュが使われるため、数秒で起動します。

### 4. サービスの動作確認

各サービスの状態を確認します:

```powershell
docker compose ps
```

**期待される出力**:
```
NAME                  IMAGE                     COMMAND                  STATUS                  PORTS
nexustext-backend     text-mining-agent-backend  "uvicorn app.main:..."  Up (healthy)            0.0.0.0:8000->8000/tcp
nexustext-frontend    text-mining-agent-frontend "nginx -g 'daemon ..."  Up (healthy)            0.0.0.0:3000->80/tcp
nexustext-postgres    postgres:16-alpine         "docker-entrypoint..."  Up (healthy)            0.0.0.0:5432->5432/tcp
nexustext-redis       redis:7-alpine             "docker-entrypoint..."  Up (healthy)            0.0.0.0:6379->6379/tcp
```

すべてのサービスで `STATUS` が `Up (healthy)` と表示されていれば成功です。

**ブラウザでのアクセス**:

| サービス | URL | 説明 |
|---------|-----|------|
| フロントエンド | http://localhost:3000 | メインダッシュボード |
| バックエンドAPI | http://localhost:8000/health | ヘルスチェック |
| APIドキュメント | http://localhost:8000/docs | Swagger UI |

**ログの確認**:

各サービスのログを確認したい場合:

```powershell
# バックエンドのログをリアルタイム表示
docker compose logs -f backend

# 全サービスのログ
docker compose logs -f

# 特定のサービスの最新50行を表示
docker compose logs --tail 50 backend
```

### 5. サービスの停止と管理

```powershell
# すべてのサービスを停止
docker compose down

# すべてのサービスを停止し、データベースのデータも削除（完全リセット）
docker compose down -v

# サービスを再起動
docker compose restart

# 特定のサービスだけ再起動
docker compose restart backend
```

---

## 方法3: クラウドデプロイ（本番環境）

本番環境では、AWS、Azure、GCPのいずれかのクラウドプロバイダーにデプロイします。NexusText AI は Terraform（テラフォーム）を使ったIaC（Infrastructure as Code）に対応しており、インフラの構築を自動化できます。

### 対応クラウドプロバイダーの比較

| 項目 | AWS | Azure | GCP |
|------|-----|-------|-----|
| **コンピュート** | EKS (Kubernetes) | AKS (Kubernetes) | GKE (Kubernetes) |
| **AI/LLM** | Bedrock | Azure Foundry | Vertex AI |
| **APIゲートウェイ** | API Gateway | APIM | Cloud Endpoints |
| **ストレージ** | S3 | Blob Storage | GCS / BigQuery |
| **シークレット管理** | Secrets Manager | Key Vault | Secret Manager |
| **モニタリング** | CloudWatch | Azure Monitor | Cloud Monitoring |
| **推奨リージョン** | ap-northeast-1 (東京) | japaneast (東日本) | asia-northeast1 (東京) |

### Terraform の基本的な使い方

1. **Terraformのインストール**

   ```
   https://developer.hashicorp.com/terraform/install
   ```

   公式サイトからWindowsインストーラーをダウンロードしてインストールします。

2. **クラウドプロバイダーの認証設定**

   - **AWS**: AWS CLIをインストールし、`aws configure` で認証情報を設定
   - **Azure**: Azure CLIをインストールし、`az login` でログイン
   - **GCP**: gcloud CLIをインストールし、`gcloud auth login` でログイン

3. **Terraformの実行（例: AWS）**

   ```powershell
   cd infra\terraform\aws

   # Terraformの初期化（プロバイダーのダウンロード）
   terraform init

   # 変更内容のプレビュー（実際のリソースは作成されない）
   terraform plan

   # リソースの作成（確認後に「yes」を入力）
   terraform apply
   ```

4. **tfvarsファイルの設定**

   `infra/terraform/tfvars.example` を参考に、各プロバイダーの設定値を記述します。

   AWS の場合:
   ```hcl
   aws_region     = "ap-northeast-1"
   cluster_name   = "nexustext-eks"
   node_count     = 3
   instance_type  = "t3.xlarge"
   environment    = "production"
   ```

   Azure の場合:
   ```hcl
   location       = "japaneast"
   resource_group = "nexustext-rg"
   cluster_name   = "nexustext-aks"
   node_count     = 3
   vm_size        = "Standard_D4s_v3"
   environment    = "production"
   ```

   GCP の場合:
   ```hcl
   project_id     = "your-gcp-project-id"
   region         = "asia-northeast1"
   cluster_name   = "nexustext-gke"
   node_count     = 3
   machine_type   = "e2-standard-4"
   environment    = "production"
   ```

### CI/CD パイプライン

NexusText AI は GitHub Actions による自動デプロイパイプラインを備えています。

- **トリガー**: `v*` タグのプッシュまたは手動ディスパッチ
- **処理フロー**: コードのチェックアウト → Dockerイメージのビルド → クラウドレジストリへのプッシュ → Terraformによるデプロイ

デプロイを実行するには、リポジトリに以下のシークレットを設定する必要があります（GitHub Settings → Secrets and variables → Actions）:

- AWS: `AWS_OIDC_ROLE_ARN`
- Azure: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`
- GCP: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`

> **注意**: クラウドデプロイは費用が発生します。開発・学習目的であれば、方法1（ローカル）または方法2（Docker）を推奨します。

---

## 環境変数リファレンス

NexusText AI で使用するすべての環境変数の一覧です。すべての変数には `NEXUSTEXT_` プレフィックスが付きます。これは `pydantic-settings` により自動的にPythonの設定クラスにマッピングされます。

### アプリケーション基本設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_APP_NAME` | 文字列 | `NexusText AI` | いいえ | アプリケーション名。APIレスポンスやログに表示されます |
| `NEXUSTEXT_APP_VERSION` | 文字列 | `7.0.0` | いいえ | アプリケーションバージョン |
| `NEXUSTEXT_DEBUG` | 真偽値 | `false` | いいえ | デバッグモード。`true`にすると詳細なエラー情報を返します。本番環境では必ず`false`にしてください |
| `NEXUSTEXT_LOG_LEVEL` | 文字列 | `INFO` | いいえ | ログ出力レベル。`DEBUG`, `INFO`, `WARNING`, `ERROR`から選択 |

### インフラストラクチャ設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_CLOUD_PROVIDER` | 文字列 | `local` | いいえ | 使用するクラウドプロバイダー。`local`, `aws`, `azure`, `gcp`から選択 |
| `NEXUSTEXT_CORS_ORIGINS` | JSON配列 | `["http://localhost:3000","http://localhost:5173"]` | いいえ | CORS（クロスオリジン）で許可するオリジンのリスト |

### データベース設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_DATABASE_URL` | 文字列 | `postgresql+asyncpg://nexustext:nexustext@localhost:5432/nexustext` | **はい** | PostgreSQLデータベースの接続URL。`asyncpg`ドライバーを使用した非同期接続 |
| `NEXUSTEXT_REDIS_URL` | 文字列 | `redis://localhost:6379/0` | **はい** | Redisの接続URL |

### LLM APIキー

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_ANTHROPIC_API_KEY` | 文字列 | （空） | **はい**（最低1つのLLMキーが必要） | Anthropic Claude APIキー。`sk-ant-`で始まります |
| `NEXUSTEXT_OPENAI_API_KEY` | 文字列 | （空） | 条件付き | OpenAI APIキー。`sk-`で始まります。PII検出やマルチリンガル分析に使用 |
| `NEXUSTEXT_GOOGLE_CLOUD_PROJECT` | 文字列 | （空） | 条件付き | Google Cloud プロジェクトID。Vertex AI（Gemini）の使用に必要 |

### LLMモデル設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_PRIMARY_MODEL` | 文字列 | `claude-opus-4-6` | いいえ | メインのLLMモデル。高品質な分析・推論に使用 |
| `NEXUSTEXT_SECONDARY_MODEL` | 文字列 | `claude-sonnet-4-5-20250929` | いいえ | セカンダリモデル。コスト効率が必要な処理に使用 |
| `NEXUSTEXT_PII_DETECTION_MODEL` | 文字列 | `gpt-5-mini` | いいえ | 個人情報検出モデル |
| `NEXUSTEXT_MULTILINGUAL_MODEL` | 文字列 | `gpt-5.1-chat` | いいえ | 多言語処理モデル |
| `NEXUSTEXT_VISION_MODEL` | 文字列 | `gemini-3.0-pro` | いいえ | 画像解析モデル |
| `NEXUSTEXT_LOCAL_MODEL` | 文字列 | `llama-4-405b` | いいえ | ローカル実行モデル（Ollama/vLLM経由） |

### Embedding設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_EMBEDDING_MODEL` | 文字列 | `paraphrase-multilingual-MiniLM-L12-v2` | いいえ | テキストをベクトルに変換するモデル。sentence-transformersのモデル名 |
| `NEXUSTEXT_EMBEDDING_DIMENSION` | 整数 | `384` | いいえ | Embeddingベクトルの次元数 |

### セキュリティ設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_SECRET_KEY` | 文字列 | `change-me-in-production` | **はい（本番）** | JWTトークンの署名に使用する秘密鍵。本番環境では `openssl rand -hex 64` で生成した値を設定してください |
| `NEXUSTEXT_JWT_ALGORITHM` | 文字列 | `HS256` | いいえ | JWTの署名アルゴリズム |
| `NEXUSTEXT_JWT_EXPIRATION_MINUTES` | 整数 | `60` | いいえ | JWTトークンの有効期限（分） |

### エージェント設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_DEFAULT_HITL_MODE` | 文字列 | `semi_auto` | いいえ | Human-in-the-Loopモード。`full_auto`（完全自動）/ `semi_auto`（半自動）/ `guided`（ガイド付き） |

### AWS設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_AWS_REGION` | 文字列 | `ap-northeast-1` | AWSの場合 | AWSリージョン |
| `NEXUSTEXT_AWS_API_GATEWAY_ID` | 文字列 | （空） | AWSの場合 | API GatewayのID |
| `NEXUSTEXT_AWS_S3_BUCKET` | 文字列 | （空） | AWSの場合 | S3バケット名 |

### Azure設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_AZURE_APIM_ENDPOINT` | 文字列 | （空） | Azureの場合 | Azure API ManagementエンドポイントURL |
| `NEXUSTEXT_AZURE_APIM_SUBSCRIPTION_KEY` | 文字列 | （空） | Azureの場合 | APIMサブスクリプションキー |
| `NEXUSTEXT_AZURE_BLOB_CONNECTION_STRING` | 文字列 | （空） | Azureの場合 | Azure Blob Storage接続文字列 |
| `NEXUSTEXT_AZURE_KEY_VAULT_URL` | 文字列 | （空） | Azureの場合 | Azure Key Vault URL |

### GCP設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_GCP_PROJECT_ID` | 文字列 | （空） | GCPの場合 | GCPプロジェクトID |
| `NEXUSTEXT_GCP_REGION` | 文字列 | `asia-northeast1` | GCPの場合 | GCPリージョン |
| `NEXUSTEXT_GCP_API_GATEWAY_ID` | 文字列 | （空） | GCPの場合 | Cloud EndpointsのID |
| `NEXUSTEXT_GCP_GCS_BUCKET` | 文字列 | （空） | GCPの場合 | GCSバケット名 |

### Docker Compose ポート設定

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_BACKEND_PORT` | 整数 | `8000` | いいえ | バックエンドの外部公開ポート |
| `NEXUSTEXT_FRONTEND_PORT` | 整数 | `3000` | いいえ | フロントエンドの外部公開ポート |
| `NEXUSTEXT_DB_PORT` | 整数 | `5432` | いいえ | PostgreSQLの外部公開ポート |
| `NEXUSTEXT_REDIS_PORT` | 整数 | `6379` | いいえ | Redisの外部公開ポート |

### プロダクション専用

| 環境変数名 | 型 | デフォルト値 | 必須 | 説明 |
|-----------|------|------------|------|------|
| `NEXUSTEXT_DB_PASSWORD` | 文字列 | （なし） | **はい（本番）** | PostgreSQLの強力なパスワード |
| `NEXUSTEXT_REDIS_PASSWORD` | 文字列 | （なし） | **はい（本番）** | Redisの強力なパスワード |

---

## LLM APIキーの取得方法

NexusText AI は複数のLLMプロバイダーに対応しています。最低1つのAPIキーが必要です。以下、各プロバイダーごとのAPIキー取得方法を詳しく説明します。

### Anthropic Claude APIキーの取得

Anthropic Claudeは、NexusText AIのメインLLMとして使用されます（`PRIMARY_MODEL`および`SECONDARY_MODEL`）。

1. **Anthropicコンソールにアクセス**

   ```
   https://console.anthropic.com/
   ```

2. **アカウントの作成**

   - 「Sign Up」をクリック
   - メールアドレスとパスワードを入力
   - メールで届く確認リンクをクリック

3. **支払い情報の設定**

   - 左メニューの「Plans & Billing」（プランと請求）をクリック
   - クレジットカードまたはデビットカード情報を入力
   - 利用プランを選択（「Build」プランから開始可能）

4. **APIキーの生成**

   - 左メニューの「API Keys」をクリック
   - 「Create Key」ボタンをクリック
   - キーの名前を入力（例: `nexustext-dev`）
   - 「Create Key」をクリック
   - 表示されたAPIキー（`sk-ant-api03-...`のような形式）をコピー

   > **重要**: APIキーは一度しか表示されません。必ずコピーして安全な場所に保存してください。

5. **`.env`ファイルに設定**

   ```env
   NEXUSTEXT_ANTHROPIC_API_KEY=sk-ant-api03-ここにコピーしたキーを貼り付け
   ```

### OpenAI APIキーの取得

OpenAIは、PII（個人情報）検出やマルチリンガル分析に使用されます。

1. **OpenAIプラットフォームにアクセス**

   ```
   https://platform.openai.com/
   ```

2. **アカウントの作成またはログイン**

   - Google、Microsoft、Appleアカウントでもログイン可能
   - 新規アカウントの場合はメール確認と電話番号認証が必要

3. **支払い情報の設定**

   - 左メニューの「Settings」→「Billing」をクリック
   - 「Add payment method」でクレジットカードを登録
   - 「Auto recharge」の設定を確認（予期しない高額請求を防ぐため、上限を設定することを推奨）

4. **APIキーの生成**

   - 左メニューの「API keys」をクリック
   - 「Create new secret key」をクリック
   - キーの名前を入力（例: `nexustext-dev`）
   - 権限を選択（「All」でOK）
   - 「Create secret key」をクリック
   - 表示されたAPIキー（`sk-proj-...`のような形式）をコピー

5. **`.env`ファイルに設定**

   ```env
   NEXUSTEXT_OPENAI_API_KEY=sk-proj-ここにコピーしたキーを貼り付け
   ```

### Google AI (Vertex AI) APIキーの取得

Google AIは、画像を含むテキスト分析（マルチモーダル）やGeminiモデルの利用に使用されます。

1. **Google Cloud Consoleにアクセス**

   ```
   https://console.cloud.google.com/
   ```

2. **Googleアカウントでログイン**

3. **プロジェクトの作成**

   - ページ上部のプロジェクト選択ドロップダウンをクリック
   - 「新しいプロジェクト」をクリック
   - プロジェクト名を入力（例: `nexustext-ai`）
   - 「作成」をクリック

4. **Vertex AI APIの有効化**

   - 左メニューから「APIとサービス」→「ライブラリ」を選択
   - 検索バーに「Vertex AI API」と入力
   - 「Vertex AI API」をクリック
   - 「有効にする」をクリック

5. **サービスアカウントの作成**

   - 左メニューから「IAMと管理」→「サービスアカウント」を選択
   - 「サービスアカウントを作成」をクリック
   - サービスアカウント名: `nexustext-backend`
   - 「作成して続行」をクリック
   - ロール: 「Vertex AI ユーザー」を選択
   - 「完了」をクリック

6. **認証の設定**

   Google Cloudの認証はAPIキーではなく、Application Default Credentials（ADC）を使用します:

   ```powershell
   gcloud auth application-default login
   ```

   ブラウザが開くので、Googleアカウントでログインして認証を許可します。

7. **`.env`ファイルに設定**

   ```env
   NEXUSTEXT_GOOGLE_CLOUD_PROJECT=nexustext-ai
   ```

   > **注意**: ここに設定するのは「プロジェクトID」です。プロジェクト名ではありません。プロジェクトIDはGoogle Cloud Consoleのダッシュボードで確認できます。

### APIキーの設定確認

すべてのAPIキーを設定したら、バックエンドを起動してAPIが正しく認識されていることを確認します:

```powershell
cd backend
.venv\Scripts\Activate.ps1
python -c "from app.core.config import settings; print('Anthropic:', 'Set' if settings.anthropic_api_key else 'Not set'); print('OpenAI:', 'Set' if settings.openai_api_key else 'Not set'); print('GCP Project:', settings.google_cloud_project or 'Not set')"
```

**期待される出力**:
```
Anthropic: Set
OpenAI: Set
GCP Project: nexustext-ai
```

---

## よくあるエラーと解決方法

### エラー1: 「'python' は、内部コマンドまたは外部コマンド...として認識されていません」

**原因**: PythonがPATHに追加されていない。

**解決方法**:
1. Pythonを一度アンインストール（「設定」→「アプリ」→「Python 3.11」→「アンインストール」）
2. 再度Pythonインストーラーを実行し、**「Add python.exe to PATH」にチェックを入れて**インストール
3. PowerShellを再起動

---

### エラー2: 「Microsoft Visual C++ 14.0 or greater is required」

**原因**: 一部のPythonパッケージ（hdbscan, numpyなど）のコンパイルにMicrosoft C++ビルドツールが必要。

**解決方法**:
1. 以下のURLからBuild Toolsをダウンロード:
   ```
   https://visualstudio.microsoft.com/ja/visual-cpp-build-tools/
   ```
2. インストーラーを実行し、「C++ によるデスクトップ開発」にチェックを入れてインストール
3. PCを再起動後、`pip install -e ".[dev]"` を再実行

---

### エラー3: 「error: could not create '.venv': [WinError 1314]」

**原因**: OneDriveの同期がファイルをロックしている。

**解決方法**:
1. タスクバーのOneDriveアイコンを右クリック
2. 「同期の一時停止」→「24時間」を選択
3. `.venv` フォルダが存在する場合は削除してから再作成:
   ```powershell
   Remove-Item -Recurse -Force .venv
   python -m venv .venv
   ```

---

### エラー4: 「psql: error: connection refused」

**原因**: PostgreSQLサービスが起動していない。

**解決方法**:
1. Windowsの「サービス」アプリを開く（Windowsキー → 「サービス」と検索）
2. 「postgresql-x64-16」を探す
3. 右クリック →「開始」
4. 状態が「実行中」になっていることを確認

もしサービスが見つからない場合:
```powershell
pg_ctl -D "C:\Program Files\PostgreSQL\16\data" start
```

---

### エラー5: 「FATAL: password authentication failed for user "nexustext"」

**原因**: データベースユーザーのパスワードが間違っている、またはユーザーが作成されていない。

**解決方法**:
1. postgresユーザーで接続:
   ```powershell
   psql -U postgres
   ```
2. ユーザーの存在を確認:
   ```sql
   \du
   ```
3. ユーザーが存在しない場合は作成:
   ```sql
   CREATE USER nexustext WITH PASSWORD 'nexustext';
   CREATE DATABASE nexustext OWNER nexustext;
   GRANT ALL PRIVILEGES ON DATABASE nexustext TO nexustext;
   ```
4. パスワードが違う場合はリセット:
   ```sql
   ALTER USER nexustext WITH PASSWORD 'nexustext';
   ```

---

### エラー6: 「npm ERR! code ENOENT」

**原因**: `frontend` フォルダ内に `package.json` が存在しない、またはディレクトリが間違っている。

**解決方法**:
1. 現在のディレクトリを確認:
   ```powershell
   Get-Location
   ```
2. `frontend` フォルダにいることを確認:
   ```powershell
   dir package.json
   ```
3. ファイルが見つからない場合は、正しいパスに移動:
   ```powershell
   cd <プロジェクトルート>\text-mining-agent\frontend
   ```

---

### エラー7: 「Module not found: Can't resolve '@/...'」

**原因**: フロントエンドのパスエイリアス（`@`）が解決できない。

**解決方法**:
1. `node_modules` を削除して再インストール:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   npm install
   ```
2. それでも解決しない場合は、`tsconfig.json` に以下のパス設定があることを確認:
   ```json
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["./src/*"]
       }
     }
   }
   ```

---

### エラー8: 「docker: Error response from daemon: Ports are not available」

**原因**: 指定されたポート（8000, 3000, 5432, 6379）が他のアプリケーションで使用されている。

**解決方法**:
1. 使用中のポートを確認:
   ```powershell
   netstat -ano | findstr ":8000"
   ```
2. 該当するプロセスを確認してID（PID）をメモ:
   ```powershell
   tasklist /FI "PID eq <プロセスID>"
   ```
3. `.env` ファイルでポートを変更:
   ```env
   NEXUSTEXT_BACKEND_PORT=8001
   NEXUSTEXT_FRONTEND_PORT=3001
   ```
4. または、競合するプロセスを停止

---

### エラー9: 「CORS error: Access to XMLHttpRequest at 'http://localhost:8000'...」

**原因**: フロントエンドとバックエンド間のCORS（クロスオリジン）設定の問題。

**解決方法**:
1. `.env` ファイルの `NEXUSTEXT_CORS_ORIGINS` に、フロントエンドのURLが含まれていることを確認:
   ```env
   NEXUSTEXT_CORS_ORIGINS=["http://localhost:3000","http://localhost:5173","http://localhost:8000"]
   ```
2. Viteの開発サーバーを使っている場合は、プロキシ設定（`vite.config.ts`）が正しく機能しているか確認。`/api` で始まるリクエストはプロキシ経由でバックエンドに転送されるため、通常はCORSエラーは発生しません
3. バックエンドを再起動

---

### エラー10: 「Redis connection refused」または「Error 111 connecting to localhost:6379」

**原因**: Redisサーバー（またはMemurai）が起動していない。

**解決方法**:

**Memuraiの場合**:
1. Windowsの「サービス」アプリで「Memurai」を探す
2. 右クリック →「開始」
3. 確認:
   ```powershell
   memurai-cli ping
   ```

**WSL2の場合**:
1. WSL2のターミナルを開く:
   ```powershell
   wsl
   ```
2. Redisを起動:
   ```bash
   sudo service redis-server start
   ```
3. 確認:
   ```bash
   redis-cli ping
   ```

---

### エラー11: 「ImportError: No module named 'app'」

**原因**: Pythonのモジュールパスが正しく設定されていない。

**解決方法**:
1. 仮想環境が有効化されていることを確認（プロンプトに `(.venv)` が表示されているか）:
   ```powershell
   .venv\Scripts\Activate.ps1
   ```
2. `backend` フォルダにいることを確認
3. パッケージが正しくインストールされていることを確認:
   ```powershell
   pip install -e ".[dev]"
   ```
4. それでも解決しない場合は、`PYTHONPATH`を設定:
   ```powershell
   $env:PYTHONPATH = "."
   ```

---

### エラー12: 「docker compose up で backend が再起動を繰り返す」

**原因**: バックエンドがデータベースまたはRedisに接続できない、またはAPIキーが未設定。

**解決方法**:
1. ログを確認:
   ```powershell
   docker compose logs backend
   ```
2. PostgreSQLが正常に起動しているか確認:
   ```powershell
   docker compose logs postgres
   ```
3. `.env` ファイルが正しくコピーされているか確認
4. コンテナを全停止して再起動:
   ```powershell
   docker compose down
   docker compose up -d
   ```

---

### エラー13: 「Embeddingモデルのダウンロードに失敗する」

**原因**: sentence-transformersが初回起動時にモデルをHugging Faceからダウンロードするが、ネットワーク問題やディスク容量不足。

**解決方法**:
1. インターネット接続を確認
2. ディスクの空き容量を確認（モデルは約500MB）
3. プロキシ環境の場合は環境変数を設定:
   ```powershell
   $env:HTTP_PROXY = "http://proxy.example.com:8080"
   $env:HTTPS_PROXY = "http://proxy.example.com:8080"
   ```
4. 手動でモデルを事前ダウンロード:
   ```powershell
   python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"
   ```

---

## 付録: VS Code推奨拡張機能

Visual Studio Code を使って NexusText AI を開発する場合、以下の拡張機能をインストールすると生産性が向上します。

### インストール方法

VS Codeを開き、左サイドバーの四角いアイコン（拡張機能）をクリックするか、`Ctrl + Shift + X` を押します。検索バーに拡張機能名を入力して「インストール」をクリックしてください。

### Python関連

| 拡張機能名 | ID | 説明 |
|-----------|------|------|
| **Python** | `ms-python.python` | Python開発の基本拡張機能。構文ハイライト、インテリセンス、デバッグなど |
| **Pylance** | `ms-python.vscode-pylance` | 高速なPython言語サーバー。型チェック、自動補完の精度向上 |
| **Ruff** | `charliermarsh.ruff` | 高速なPythonリンター・フォーマッター。NexusText AIのコードスタイルに準拠 |
| **Python Debugger** | `ms-python.debugpy` | Pythonのデバッグ実行に使用 |

### TypeScript / React関連

| 拡張機能名 | ID | 説明 |
|-----------|------|------|
| **ES7+ React/Redux Snippets** | `dsznajder.es7-react-js-snippets` | Reactコンポーネントのスニペット（ショートカット入力） |
| **Tailwind CSS IntelliSense** | `bradlc.vscode-tailwindcss` | Tailwind CSSクラスの自動補完 |
| **ESLint** | `dbaeumer.vscode-eslint` | JavaScript/TypeScriptの静的解析 |

### データベース関連

| 拡張機能名 | ID | 説明 |
|-----------|------|------|
| **PostgreSQL** | `ckolkman.vscode-postgres` | VS CodeからPostgreSQLに接続してクエリを実行 |

### Docker / インフラ関連

| 拡張機能名 | ID | 説明 |
|-----------|------|------|
| **Docker** | `ms-azuretools.vscode-docker` | Dockerfileやdocker-compose.ymlの編集支援 |
| **HashiCorp Terraform** | `hashicorp.terraform` | Terraformファイル（.tf）の構文ハイライト・自動補完 |

### 汎用ツール

| 拡張機能名 | ID | 説明 |
|-----------|------|------|
| **GitLens** | `eamodio.gitlens` | Git履歴の可視化、各行の最終変更者の表示 |
| **Thunder Client** | `rangav.vscode-thunder-client` | VS Code内でAPIリクエストをテスト（Postmanの代替） |
| **YAML** | `redhat.vscode-yaml` | YAMLファイル（docker-compose.yml、GitHub Actionsなど）の編集支援 |
| **DotENV** | `mikestead.dotenv` | `.env` ファイルの構文ハイライト |
| **Error Lens** | `usernamehw.errorlens` | エラーや警告をコード行の横にインライン表示 |

### 推奨設定（settings.json）

VS Codeの設定ファイル（`Ctrl + ,` → 右上の「設定（JSON）を開く」アイコン）に以下を追加すると、NexusText AIの開発に最適な環境になります:

```json
{
  // Python
  "python.defaultInterpreterPath": "${workspaceFolder}/backend/.venv/Scripts/python.exe",
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports.ruff": "explicit"
    }
  },
  "python.analysis.typeCheckingMode": "basic",

  // TypeScript
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },

  // Tailwind CSS
  "tailwindCSS.experimental.classRegex": [
    ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ],

  // ファイル除外
  "files.exclude": {
    "**/__pycache__": true,
    "**/.pytest_cache": true,
    "**/node_modules": true,
    "**/.mypy_cache": true
  },

  // エディタ基本設定
  "editor.tabSize": 2,
  "editor.rulers": [120],
  "files.trimTrailingWhitespace": true,
  "files.insertFinalNewline": true
}
```

---

## ユーザー操作ガイド

### データインポートの流れ

1. **ファイルアップロード**: 「データインポート」ページでCSV/Excel/JSON/PDF/Word/テキストファイルをドラッグ&ドロップ
2. **カラムマッピング**: 左側に表示される分析フィールド（テキスト本文[必須]、ID、日付、カテゴリ、著者、ソース）に対して、右側のドロップダウンからCSVカラムを選択。未マッピングのカラムは自動的に「属性」として取り込まれます
3. **データプレビュー**: 取り込まれるデータの先頭行を確認
4. **インポート実行**: 「インポート」ボタンで取込開始。文字コード自動検出→データ読み込み→DB保存の3ステップで処理

### AIエージェント操作

1. **分析目的の入力**: 「このデータから何を知りたいか」を自然言語で入力（例：「顧客の不満要因を特定する」）
2. **HITL制御モード選択**: Full Auto（全自動）/ Semi-Auto（重要判断で承認要求）/ Guided（各ステップで承認）
3. **分析開始**: 「AI分析を開始」ボタンをクリック。オプションで「分析完了後にレポートを自動生成する」チェックボックスを有効にすると、分析→レポート生成を一気通貫で実行
4. **進捗確認**: 5フェーズ（観測→仮説→探索→検証→統合）の進捗がリアルタイムでアニメーション表示。3秒間隔でポーリング
5. **結果保存**: 分析完了後に「分析結果を保存」ボタンでDBに永続化。「過去の分析セッション」から復元可能
6. **タブ遷移**: 分析中に他のページに移動しても、戻った際に進捗画面が自動復元されます

### レポート生成

1. **テンプレート選択**: VOC分析、監査分析、コンプライアンス、リスク分析、カスタムから選択
2. **カスタムプロンプト**: テキストエリアでレポートの指示内容を自由にカスタマイズ
3. **出力形式選択**: PDF / PowerPoint / Word / Excel
4. **生成実行**: 「レポートを生成」ボタンで生成開始。完了後にダウンロード可能

### エラー発生時

エラーが発生した場合、画面に日本語のエラーメッセージとエラーID（8文字）が表示されます。問題が解決しない場合は、このエラーIDを管理者にお伝えください。

---

## おわりに

以上で NexusText AI v7.0 のセットアップは完了です。

**推奨する次のステップ**:

1. ダッシュボード（`http://localhost:5173/`）にアクセスして、UIを確認
2. 「データインポート」ページからCSVファイルをアップロードし、カラムマッピングを設定
3. クラスタリング分析やセンチメント分析を実行（各パラメータのInfoTooltipで説明を確認）
4. AIエージェントで自律分析を実行し、進捗アニメーションを確認
5. レポート生成でカスタムプロンプトを入力し、PDFをダウンロード
6. APIドキュメント（`http://localhost:8000/docs`）で利用可能なエンドポイントを確認

問題が発生した場合は、[よくあるエラーと解決方法](#よくあるエラーと解決方法)セクションを参照するか、プロジェクトのIssueトラッカーに報告してください。
