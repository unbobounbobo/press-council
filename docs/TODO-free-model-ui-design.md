# Press Council ローンチ準備 タスクリスト

作成日: 2025-12-10
更新日: 2025-12-10

## 概要

Press Council を無料サービスとしてローンチするための実装タスク。
- Phase 0: ユーザー管理（**ローンチ必須**）
- Phase 1: 無料モデルUI
- Phase 2: 有料プラン（後日）

---

## 🚨 Phase 0: ユーザー管理（ローンチ必須）

| # | タスク | 内容 | 状態 |
|---|--------|------|------|
| 0-1 | Supabase プロジェクト作成 | Press Council 用プロジェクト新規作成 | ✅ 完了 |
| 0-2 | Auth設定 | メール認証 + Google OAuth 有効化 | ✅ 完了 |
| 0-3 | profiles テーブル作成 | id, email, plan, is_admin, created_at | ✅ 完了 |
| 0-4 | RLS・トリガー設定 | セキュリティポリシー、自動profile作成 | ✅ 完了 |
| 0-5 | フロントエンド認証連携 | @supabase/supabase-js + React統合 | ✅ 完了 |
| 0-6 | バックエンド認証連携 | JWT検証、ユーザー情報取得 | 🔄 作業中 |
| 0-7 | is_admin によるProテスト | 管理者のみ全モデル使用可 | 未着手 |
| 0-8 | 「Proプラン準備中」UI | 有料プランは Coming Soon 表示 | 未着手 |

### 前提条件
- ✅ Supabase アカウント: あり
- ✅ Press Council 用プロジェクト: 作成済み
  - URL: `https://bdoffkdkoodezejqoqsb.supabase.co`
  - .env に設定済み

### Supabase スキーマ

```sql
-- profiles テーブル
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text default 'free' check (plan in ('free', 'pro')),
  is_admin boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- RLS (Row Level Security)
alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- 新規ユーザー作成時に自動でprofile作成
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### アクセス制御ロジック

```python
# backend/auth.py
def get_user_plan(user_id: str) -> dict:
    """ユーザーのプラン情報を取得"""
    profile = supabase.table('profiles').select('*').eq('id', user_id).single().execute()
    return profile.data

def get_available_models(user: dict) -> list:
    """ユーザーが使用可能なモデル一覧"""
    if user.get('is_admin'):
        return ALL_MODELS  # 管理者は全モデル
    elif user.get('plan') == 'pro':
        return PRO_MODELS
    else:
        return FREE_MODELS
```

---

## Phase 1: 無料モデルUI

### バックエンド（3件）

| # | タスク | 内容 | 状態 |
|---|--------|------|------|
| 1-1 | models.py 新規作成 | 3層構造: Tier/Registry/Assignment | 未着手 |
| 1-2 | config.py リファクタリング | 既存LLM_BLOCKSを新構造に移行 | 未着手 |
| 1-3 | APIレスポンス拡張 | 全stageでモデル情報を返す | 未着手 |

### フロントエンドUI（7件）

| # | タスク | 内容 | 状態 |
|---|--------|------|------|
| 1-4 | モデルバッジコンポーネント | 🆓 Free / ⭐ Standard / 👑 Premium | 未着手 |
| 1-5 | Stage1 バッジ追加 | 各ドラフトにモデル名・バッジ表示 | 未着手 |
| 1-6 | Stage2 バッジ追加 | 各評価にモデル名・バッジ表示 | 未着手 |
| 1-7 | Stage3 バッジ追加 | 最終版にモデル名・バッジ表示 | 未着手 |
| 1-8 | 使用モデル一覧セクション | 右サイドバーに追加 | 未着手 |
| 1-9 | アップグレード促進カード | 品質比較、CTAボタン | 未着手 |
| 1-10 | 比較プレビュー機能 | Proモデル出力サンプル（オプション） | 未着手 |

### ドキュメント（2件）

| # | タスク | 内容 | 状態 |
|---|--------|------|------|
| 1-11 | 利用規約ページ | モデル変更権・免責事項 | 未着手 |
| 1-12 | モックアップ更新 | mockup-v5にUI追加 | 未着手 |

---

## Phase 2: 有料プラン（後日）

| # | タスク | 内容 | 状態 |
|---|--------|------|------|
| 2-1 | Stripe連携 | 決済処理 | 未着手 |
| 2-2 | プラン切り替えUI | free ↔ pro | 未着手 |
| 2-3 | 使用量制限 | プラン別の回数制限 | 未着手 |
| 2-4 | 管理画面: モデル切替 | 運用時のモデル変更 | 未着手 |
| 2-5 | 管理画面: モニタリング | モデル可用性確認 | 未着手 |

---

## 設計詳細

### 3層構造のモデル管理

```
┌─────────────────────────────────────────────────────┐
│  Tier Layer（抽象・固定）                            │
│  "free" / "standard" / "premium"                    │
├─────────────────────────────────────────────────────┤
│  Model Registry（具体・可変）                        │
│  DeepSeek R1, Llama 4, Claude Opus, GPT-4...        │
├─────────────────────────────────────────────────────┤
│  Role Assignment（役割・可変）                       │
│  writer_1 → deepseek-r1, evaluator → qwen-qwq...   │
└─────────────────────────────────────────────────────┘
```

### APIレスポンス例

```json
{
  "stage1": {
    "drafts": [
      {
        "label": "案A",
        "content": "...",
        "model": {
          "id": "deepseek-r1-free",
          "name": "DeepSeek R1",
          "provider": "DeepSeek",
          "tier": "free",
          "tier_badge": "🆓",
          "tier_name": "フリー"
        }
      }
    ]
  },
  "metadata": {
    "plan": "free",
    "models_used": [...],
    "upgrade_prompt": {
      "show": true,
      "message": "Proプランでは Claude Opus、GPT-4 など最高品質モデルで生成できます",
      "quality_boost": "+36%"
    }
  }
}
```

### 利用規約の要点

- 使用するAIモデルは予告なく変更される場合がある
- 無料プランで使用するモデルは運営状況に応じて随時変更
- 特定のAIモデルの継続的な提供を保証しない
- モデル変更に起因する出力変化について責任を負わない

---

## 優先度まとめ

| 優先度 | Phase | タスク |
|--------|-------|--------|
| 🔴 最優先 | 0 | ユーザー管理（#0-1〜0-7） |
| 🟠 高 | 1 | モデル管理・基本UI（#1-1〜1-8） |
| 🟡 中 | 1 | アップグレードUI・利用規約（#1-9〜1-12） |
| 🟢 低 | 2 | 有料プラン・管理画面（#2-1〜2-5） |

---

## 関連ファイル

### 新規作成
- `backend/auth.py` - 認証・認可ロジック
- `backend/models.py` - モデル管理
- `frontend/src/components/Auth.jsx` - ログイン/登録UI
- `frontend/src/components/ModelBadge.jsx` - バッジコンポーネント
- `frontend/src/contexts/AuthContext.jsx` - 認証状態管理

### 修正
- `backend/config.py` - リファクタリング
- `backend/evaluation.py` - APIレスポンス修正
- `backend/main.py` - 認証ミドルウェア追加
- `frontend/src/App.jsx` - 認証フロー追加
- `frontend/src/components/Stage1.jsx` - バッジ追加
- `frontend/src/components/Stage2.jsx` - バッジ追加
- `frontend/src/components/Stage3.jsx` - バッジ追加
- `design/mockup-v5-newspicks.html` - UI追加
