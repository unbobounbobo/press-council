# CLAUDE.md - Press Council 技術仕様書

プレスリリース作成支援システムの技術詳細と実装ノート。

## プロジェクト概要

Press Councilは**3ステージの審議システム**で、複数のLLMがプレスリリースを作成し、記者ペルソナが匿名評価を行い、編集長AIが最終版を執筆します。

### 3ステージワークフロー

| Stage | 内容 | 並列処理 |
|-------|------|----------|
| **Stage 1** | 複数LLMがプレスリリース案を作成 | ✅ |
| **Stage 2** | 5種類の記者ペルソナ × LLMで匿名評価・ランキング | ✅ |
| **Stage 3** | 編集長AIが評価を踏まえて最終版を執筆 | - |

### 評価パターン数

| モード | ライター数 | 評価数 | 計算式 |
|--------|-----------|--------|--------|
| シンプル | 3 | 5 | 選抜ペルソナ×LLM |
| おすすめ | 3 | 10 | ペルソナ×2モデル |
| **フル** | 4 | **20** | **5ペルソナ × 4LLM** |

## アーキテクチャ

### バックエンド構成 (`backend/`)

**`config.py`** - 設定の中核
- `LLMBlock`: モデル定義（id, name, model, provider, tier, cost_factor）
- `JournalistPersona`: 記者ペルソナ定義（媒体、重視観点、トーン、批判度）
- `ModeConfig`: プリセット設定（シンプル/おすすめ/フル）
- `CRITICISM_LEVELS`: 批判度レベル（1=最寛容〜5=最厳格）
- 環境変数 `OPENROUTER_API_KEY` を使用
- バックエンドは**ポート8001**で起動

**`prompts.py`** - プロンプトテンプレート
- `WRITER_SYSTEM_PROMPT`: Stage 1のライター用システムプロンプト
- `PERSONA_DETAILED_PROFILES`: 各記者ペルソナの詳細プロファイル
  - キャラクター名、年齢、経験年数、バックグラウンド
  - 内面の思考プロセス（internal_monologue）
  - レビュー手順（最初の3秒→30秒→2分）
  - よく聞く質問、レッドフラッグ、出力形式
- `build_reviewer_system_prompt()`: 批判度に応じたプロンプト生成
- `EDITOR_SYSTEM_PROMPT`: Stage 3の編集長プロンプト

**`evaluation.py`** - 評価ワークフロー
- `stage1_write_drafts()`: 並列でドラフト作成
- `stage2_evaluate_drafts()`: マトリクス評価（LLM×ペルソナ）を並列実行
- `stage3_synthesize()`: 編集長による最終版生成
- `parse_ranking_from_text()`: "FINAL RANKING:" セクションから順位を抽出
- `calculate_aggregate_rankings()`: 全評価の平均順位を計算
- `build_cross_table()`: クロステーブル（LLM×ペルソナ×案）生成

**`council.py`** - エントリーポイント
- `run_press_release_council()`: メインワークフロー呼び出し
- `generate_conversation_title()`: 会話タイトル自動生成

**`openrouter.py`** - API通信
- `query_model()`: 単一モデルへの非同期クエリ
- `query_models_parallel()`: `asyncio.gather()` による並列クエリ
- グレースフルデグラデーション：一部モデル失敗時も続行

**`storage.py`** - データ永続化
- JSON形式で `data/conversations/` に保存
- 各会話: `{id, title, created_at, updated_at, messages[]}`

**`main.py`** - FastAPI アプリ
- CORS: localhost:5173, localhost:3000 を許可
- POST `/api/conversations/{id}/message`: 3ステージ処理実行
- GET `/api/config`: 設定情報取得（LLMブロック、ペルソナ、モード一覧）

### LLMブロック定義

| ID | 名前 | モデル | コスト係数 |
|----|------|--------|-----------|
| opus | Claude Opus | anthropic/claude-opus-4 | 3.0 |
| gpt | GPT-5.1 | openai/gpt-5.1 | 2.0 |
| gemini | Gemini Pro | google/gemini-3-pro-preview | 1.0 |
| grok | Grok 4.1 | x-ai/grok-3 | 2.0 |

### 記者ペルソナ定義

| ID | 名前 | 媒体例 | 重視観点 | 基本批判度 |
|----|------|--------|----------|-----------|
| nikkei | 日経記者 | 日本経済新聞 | 企業価値、株価影響、数字の正確性 | 4（厳格） |
| lifestyle | 全国紙生活部 | 朝日・毎日新聞 | 消費者目線、わかりやすさ、社会的意義 | 3（標準） |
| web | Web記者 | ITmedia・インプレス | 技術的新規性、SEO、読みやすさ | 3（標準） |
| trade | 業界専門誌 | 日刊工業・電波新聞 | 技術詳細、スペック、業界への影響 | 5（最厳格） |
| tv | 経済テレビ | WBS・NHK | 視聴者の関心、映像映え、キャッチーさ | 2（寛容） |

### フロントエンド構成 (`frontend/src/`)

**`App.jsx`**
- 会話管理とモード選択
- メタデータ（label_to_model、aggregate_rankings）の状態管理

**`components/`**
- `ChatInterface.jsx`: 入力UI（Enter送信、Shift+Enter改行）
- `ModeSelector.jsx`: プリセット・カスタム設定UI
- `Stage1.jsx`: ライター出力のタブ表示
- `Stage2.jsx`: 記者評価のタブ表示 + 総合ランキング + クロステーブル
- `Stage3.jsx`: 編集長の最終版表示（緑背景 #f0fff0）

## 主要な設計判断

### Stage 2の匿名化戦略
1. ドラフトは「案A」「案B」「案C」等の匿名ラベルで評価者に提示
2. バックエンドで `label_to_model` マッピングを保持
3. フロントエンドで表示時に逆匿名化（**太字**でモデル名表示）
4. 評価者（LLM）はモデル名を知らないため、公平な評価が可能

### 批判度システム
```
1: 最寛容 - ポジティブな評価傾向
2: 寛容 - やや寛容な評価
3: 標準 - バランスの取れた評価
4: 厳格 - やや厳しい評価
5: 最厳格 - 細部まで厳しくチェック
```

各ペルソナには基本批判度があり、UIで全体調整可能。

### ランキング抽出形式
Stage 2の出力から以下の形式でランキングを抽出：
```
FINAL RANKING:
1. 案C - （理由）
2. 案A - （理由）
3. 案B - （理由）
```

`parse_ranking_from_text()` が正規表現で抽出し、フォールバックとして全文から「案X」パターンを検出。

### エラーハンドリング方針
- 一部モデル失敗時も成功したモデルの結果で続行
- Stage 3のタイムアウトは180秒（大量データ処理のため）
- クレジット不足エラーは `is_credit_error` フラグで識別

## データフロー

```
ユーザー入力（プレスリリース素案）
    ↓
Stage 1: 並列クエリ → [ドラフト A, B, C, D]
    ↓
Stage 2: 匿名化 → マトリクス評価（並列）
    │  ┌─────────────────────────────────────────┐
    │  │ LLM×Persona Matrix (フルモード時: 20件) │
    │  │ opus×nikkei, opus×lifestyle, ...       │
    │  │ gpt×nikkei, gpt×lifestyle, ...         │
    │  │ gemini×nikkei, gemini×lifestyle, ...   │
    │  │ grok×nikkei, grok×lifestyle, ...       │
    │  └─────────────────────────────────────────┘
    ↓
集計: aggregate_rankings, persona_breakdown, cross_table
    ↓
Stage 3: 編集長が全情報を統合 → 最終版プレスリリース
    ↓
API Response: {stage1, stage2, stage3, metadata}
    ↓
Frontend: タブ表示 + ランキング + クロステーブル
```

## ポート設定

| サービス | ポート | 備考 |
|----------|--------|------|
| Backend | 8001 | 8000は別アプリで使用中のため |
| Frontend | 5173 | Viteデフォルト |

変更時は `backend/main.py` と `frontend/src/api.js` を両方更新。

## 開発時の注意点

### 相対インポート
バックエンドモジュールは相対インポートを使用：
```python
from .config import ...  # ○ 正しい
from backend.config import ...  # × 避ける
```

起動コマンド：
```bash
python -m backend.main  # プロジェクトルートから実行
```

### Markdown レンダリング
ReactMarkdownコンポーネントは `<div className="markdown-content">` でラップ。
スタイルは `index.css` で定義（12pxパディング）。

### メタデータの揮発性
`metadata`（label_to_model、aggregate_rankings等）はAPIレスポンスに含まれるが、
JSONストレージには永続化されない。UI状態として一時保持のみ。

## 拡張ポイント

- 新しいLLMブロック追加: `config.py` の `LLM_BLOCKS` に追記
- 新しいペルソナ追加: `config.py` の `JOURNALIST_PERSONAS` と `prompts.py` の `PERSONA_DETAILED_PROFILES` に追記
- 新しいモード追加: `config.py` の `MODE_CONFIGS` に追記
- プロンプト調整: `prompts.py` の各テンプレートを編集

## テスト

```bash
# OpenRouter接続テスト
python test_openrouter.py

# バックエンド起動確認
curl http://localhost:8001/api/config
```

## 関連リンク

- インスピレーション元: [karpathy/llm-council](https://github.com/karpathy/llm-council)
- OpenRouter: https://openrouter.ai/
