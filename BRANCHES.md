# ブランチ運用ガイド

このドキュメントはPRナビのブランチ運用ルールを説明します。

## ブランチ構成図

```
main (本番環境)
  │
  └── develop (開発の基点)
        │
        ├── design/         ← デザインバリエーション
        │     ├── minimal-clean      シンプル・クリーンなUI
        │     └── dashboard-style    ダッシュボード風UI
        │
        └── target/         ← ターゲット・機能バリエーション
              ├── enterprise         企業向け（チーム機能、管理画面）
              └── individual         個人向け（シンプル機能）
```

## ブランチの役割

| ブランチ | 役割 | マージ先 |
|---------|------|---------|
| `main` | 本番環境。安定版のみ | - |
| `develop` | 開発の基点。新ブランチはここから作成 | main |
| `design/*` | UIデザインの実験・バリエーション | develop |
| `target/*` | ターゲット別の機能変更 | develop |

## 基本的な使い方

### 1. 新しいデザインを試す

```bash
# developから新しいブランチを作成
git checkout develop
git checkout -b design/dark-theme

# 開発...

# pushしてリモートに保存
git push -u origin design/dark-theme
```

### 2. 新しいターゲット向け機能を作る

```bash
# developから新しいブランチを作成
git checkout develop
git checkout -b target/agency

# 開発...

git push -u origin target/agency
```

### 3. ブランチを切り替える

```bash
# 一覧を見る
git branch -a

# 切り替える
git checkout design/minimal-clean
```

### 4. 良いものをdevelopに取り込む

```bash
# developに切り替え
git checkout develop

# マージ
git merge design/minimal-clean

# push
git push origin develop
```

### 5. developをmainにリリース

```bash
git checkout main
git merge develop
git push origin main
```

## 命名規則

| 接頭辞 | 用途 | 例 |
|--------|------|-----|
| `design/` | UIデザインの変更 | `design/dark-mode`, `design/mobile-first` |
| `target/` | ターゲット・機能の変更 | `target/agency`, `target/freemium` |
| `feature/` | 新機能追加 | `feature/export-pdf`, `feature/team-share` |
| `fix/` | バグ修正 | `fix/login-error`, `fix/api-timeout` |
| `experiment/` | 実験的な変更 | `experiment/ai-v2`, `experiment/new-api` |

## 現在のブランチ一覧

- **main** - 本番環境（Renderにデプロイ）
- **develop** - 開発の基点
- **design/minimal-clean** - シンプルなUI
- **design/dashboard-style** - ダッシュボード風UI
- **target/enterprise** - 企業向け機能
- **target/individual** - 個人向け機能

## Tips

### よく使うコマンド

```bash
# 今いるブランチを確認
git branch

# 変更を一時保存してブランチ切り替え
git stash
git checkout other-branch
git stash pop  # 変更を戻す

# ブランチを削除（ローカル）
git branch -d branch-name

# ブランチを削除（リモート）
git push origin --delete branch-name
```

### Renderで複数環境をデプロイ

各ブランチを別々のRenderサービスにデプロイ可能：

1. Render Dashboard → New → Web Service
2. GitHubリポジトリを選択
3. **Branch** で対象ブランチを選択
4. デプロイ

例：
- `main` → https://prnavi.onrender.com（本番）
- `design/minimal-clean` → https://prnavi-minimal.onrender.com（テスト）
