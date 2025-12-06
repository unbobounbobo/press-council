![Generated Image December 02, 2025 - 9_13PM](https://github.com/user-attachments/assets/e3ea549f-9694-4ebd-8e66-cb5f9dbf850f)

# Press Council

複数のAIが原稿を作成し、記者視点で評価・ランキング・最終版を生成するプレスリリース作成支援ツール

## 概要

![Generated Image December 04, 2025 - 6_31PM](https://github.com/user-attachments/assets/97f3fa78-2da5-4820-aab1-23b1f3ceaf31)

Press Councilは3段階のワークフローでプレスリリースを作成します：

1. **原稿作成** - 複数のLLMが独立してドラフトを作成
2. **記者評価** - 5種類の記者ペルソナがドラフトを匿名評価・ランキング
3. **最終執筆** - 評価結果を踏まえて編集長AIが最終版を作成

## 特徴

- **マルチLLM対応**: Claude Opus、GPT-5.1、Gemini Pro、Grok 4.1
- **多角的評価**: 日経記者、全国紙生活部、Web記者、業界専門誌、経済テレビの5ペルソナ
- **カスタマイズ可能**: ライター・評価者・編集者を自由に組み合わせ
- **批判度調整**: 寛容〜厳格まで5段階で評価の厳しさを調整

## セットアップ

### 必要なもの

- Python 3.10+
- Node.js 18+
- [OpenRouter](https://openrouter.ai/) APIキー

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/yourname/press-council.git
cd press-council

# バックエンドの依存関係をインストール
pip install -r requirements.txt

# フロントエンドの依存関係をインストール
cd frontend
npm install
```

### 環境変数

プロジェクトルートに `.env` ファイルを作成：

```
OPENROUTER_API_KEY=your_api_key_here
```

## 起動方法

ターミナルを2つ開いて、それぞれ実行：

```bash
# バックエンド（ポート8001）
python -m backend.main

# フロントエンド（ポート5173）
cd frontend
npm run dev
```

ブラウザで http://localhost:5173 を開く

## 使い方

<img width="1170" height="970" alt="スクリーンショット 2025-12-04 211416" src="https://github.com/user-attachments/assets/4049d2aa-df88-49ee-ab32-0c9f811be701" />

1. 「+ 新規作成」をクリック
2. プリセットを選択（シンプル / おすすめ / フル）
3. 必要に応じてライター・評価マトリクス・編集者をカスタマイズ
4. リリース素案や発表概要を入力
5. 「作成」をクリック

## プリセット

| プリセット | 評価数 | 用途 |
|-----------|--------|------|
| シンプル | 5件 | 素早く確認したい時 |
| おすすめ | 10件 | バランス重視 |
| フル | 20件 | 徹底的に評価したい時 |

## ライセンス

MIT

## 謝辞

[karpathy/llm-council](https://github.com/karpathy/llm-council) にインスパイアされています。
