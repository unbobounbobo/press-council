"""Configuration for the Press Release Council System.

This module defines:
- LLM blocks (modular model definitions)
- Mode settings (シンプル/おすすめ/フル)
- Journalist personas for evaluation
- Role assignments for each stage
"""

import os
from dotenv import load_dotenv
from dataclasses import dataclass, field
from typing import Literal

load_dotenv()

# =============================================================================
# API Configuration
# =============================================================================

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
DATA_DIR = "data/conversations"

# =============================================================================
# LLM Block Definitions
# =============================================================================

@dataclass
class LLMBlock:
    """Represents a single LLM configuration block."""
    id: str                    # Unique identifier (e.g., "opus", "gpt")
    name: str                  # Display name (e.g., "Claude Opus")
    model: str                 # OpenRouter model identifier
    provider: str              # Provider name (e.g., "Anthropic")
    tier: Literal["premium", "standard", "free"]  # Performance tier: premium=Pro only, standard/free=Free plan OK
    description: str = ""      # Brief description
    cost_factor: float = 1.0   # Relative cost (1.0 = baseline)

    def __hash__(self):
        return hash(self.id)


# Available LLM Blocks - OpenRouter models
# tier: "free" = 無料プランで利用可, "standard" = 無料プランで利用可, "premium" = Proプラン専用
LLM_BLOCKS = {
    # ===== FREE TIER (無料プランで利用可) =====
    "gemini-flash": LLMBlock(
        id="gemini-flash",
        name="Gemini 2.0 Flash",
        model="google/gemini-2.0-flash-exp:free",
        provider="Google",
        tier="free",
        description="高速・無料",
        cost_factor=0.0
    ),
    "gemini-flash-thinking": LLMBlock(
        id="gemini-flash-thinking",
        name="Gemini 2.0 Flash Thinking",
        model="google/gemini-2.0-flash-thinking-exp:free",
        provider="Google",
        tier="free",
        description="推論強化・無料",
        cost_factor=0.0
    ),
    "llama-70b": LLMBlock(
        id="llama-70b",
        name="Llama 3.3 70B",
        model="meta-llama/llama-3.3-70b-instruct",
        provider="Meta",
        tier="free",
        description="高性能オープン",
        cost_factor=0.5
    ),
    "qwen-32b": LLMBlock(
        id="qwen-32b",
        name="Qwen 2.5 32B",
        model="qwen/qwen-2.5-32b-instruct",
        provider="Alibaba",
        tier="free",
        description="多言語対応",
        cost_factor=0.3
    ),
    "mistral-small": LLMBlock(
        id="mistral-small",
        name="Mistral Small",
        model="mistralai/mistral-small-24b-instruct-2501",
        provider="Mistral",
        tier="free",
        description="軽量・高速",
        cost_factor=0.2
    ),

    # ===== STANDARD TIER (無料プランで利用可・やや高性能) =====
    "gemini-pro": LLMBlock(
        id="gemini-pro",
        name="Gemini 1.5 Pro",
        model="google/gemini-pro-1.5",
        provider="Google",
        tier="standard",
        description="バランス型",
        cost_factor=1.0
    ),
    "claude-haiku": LLMBlock(
        id="claude-haiku",
        name="Claude 3.5 Haiku",
        model="anthropic/claude-3.5-haiku",
        provider="Anthropic",
        tier="standard",
        description="高速・低コスト",
        cost_factor=0.8
    ),
    "deepseek-chat": LLMBlock(
        id="deepseek-chat",
        name="DeepSeek V3",
        model="deepseek/deepseek-chat",
        provider="DeepSeek",
        tier="standard",
        description="コスパ最強",
        cost_factor=0.3
    ),

    # ===== PREMIUM TIER (Proプラン専用) =====
    "claude-sonnet": LLMBlock(
        id="claude-sonnet",
        name="Claude 4 Sonnet",
        model="anthropic/claude-sonnet-4",
        provider="Anthropic",
        tier="premium",
        description="最新・高品質",
        cost_factor=2.0
    ),
    "claude-opus": LLMBlock(
        id="claude-opus",
        name="Claude 4 Opus",
        model="anthropic/claude-opus-4",
        provider="Anthropic",
        tier="premium",
        description="最高性能",
        cost_factor=5.0
    ),
    "gpt-4o": LLMBlock(
        id="gpt-4o",
        name="GPT-4o",
        model="openai/gpt-4o",
        provider="OpenAI",
        tier="premium",
        description="マルチモーダル",
        cost_factor=2.0
    ),
    "gpt-4-turbo": LLMBlock(
        id="gpt-4-turbo",
        name="GPT-4 Turbo",
        model="openai/gpt-4-turbo",
        provider="OpenAI",
        tier="premium",
        description="高速GPT-4",
        cost_factor=1.5
    ),
    "grok-2": LLMBlock(
        id="grok-2",
        name="Grok 2",
        model="x-ai/grok-2-1212",
        provider="xAI",
        tier="premium",
        description="独自視点",
        cost_factor=1.5
    ),
    "gemini-exp": LLMBlock(
        id="gemini-exp",
        name="Gemini Exp 1206",
        model="google/gemini-exp-1206:free",
        provider="Google",
        tier="premium",
        description="実験版・最新",
        cost_factor=0.0
    ),
}

# =============================================================================
# Journalist Personas for Evaluation
# =============================================================================

@dataclass
class JournalistPersona:
    """Represents a journalist persona for press release evaluation."""
    id: str                    # Unique identifier
    name: str                  # Display name
    media_type: str            # Media category
    outlet_example: str        # Example outlet name
    focus_areas: list[str]     # Key evaluation focus areas
    tone: str                  # Expected writing tone
    description: str           # Detailed persona description
    criticism_base: int = 3    # Base criticism level (1-5, 3=標準)


# Journalist Personas - Matches the UI mockup
JOURNALIST_PERSONAS = {
    "nikkei": JournalistPersona(
        id="nikkei",
        name="日経記者",
        media_type="経済紙",
        outlet_example="日本経済新聞",
        focus_areas=["企業価値", "株価影響", "経営戦略", "数字の正確性"],
        tone="客観的・分析的",
        description="日経新聞の企業報道部・ビジネス報道ユニット記者。企業価値と市場への影響を重視。",
        criticism_base=4
    ),
    "lifestyle": JournalistPersona(
        id="lifestyle",
        name="全国紙生活部",
        media_type="全国紙",
        outlet_example="朝日新聞・毎日新聞",
        focus_areas=["消費者目線", "生活への影響", "わかりやすさ", "社会的意義"],
        tone="親しみやすい・共感的",
        description="全国紙の生活部記者。一般読者の視点で消費者への影響を重視。",
        criticism_base=3
    ),
    "web": JournalistPersona(
        id="web",
        name="Web記者",
        media_type="Webメディア",
        outlet_example="ITmedia・インプレスウォッチ",
        focus_areas=["技術的新規性", "IT業界トレンド", "読みやすさ", "SEO"],
        tone="カジュアル・エンゲージング",
        description="ITメディア・インプレスウォッチ等のWeb記者。技術的な正確性とトレンド性を重視。",
        criticism_base=3
    ),
    "trade": JournalistPersona(
        id="trade",
        name="業界専門誌",
        media_type="業界専門紙",
        outlet_example="日刊工業新聞・電波新聞",
        focus_areas=["技術詳細", "業界動向", "専門用語の正確性", "業界への影響"],
        tone="専門的・技術志向",
        description="業界専門紙の記者。技術的な正確性と業界への影響を深掘り。",
        criticism_base=5
    ),
    "tv": JournalistPersona(
        id="tv",
        name="経済テレビ",
        media_type="テレビ",
        outlet_example="WBS・NHK",
        focus_areas=["視聴者の関心", "映像映え", "キャッチーさ", "社会的インパクト"],
        tone="わかりやすい・インパクト重視",
        description="ワールドビジネスサテライト・NHK経済番組の記者。視聴者目線でわかりやすさを重視。",
        criticism_base=2
    ),
}

# =============================================================================
# Mode Configuration
# =============================================================================

@dataclass
class ModeConfig:
    """Configuration for each evaluation mode."""
    id: str
    name: str
    name_ja: str              # Japanese display name
    description: str
    # Default matrix: list of (llm_block_id, persona_id) tuples
    default_matrix: list[tuple[str, str]]
    default_writers: list[str]  # Default writer LLM block IDs
    default_editor: str         # Default editor LLM block ID
    estimated_time_min: int     # Minutes
    estimated_cost_yen: int     # Yen


MODE_CONFIGS = {
    "simple": ModeConfig(
        id="simple",
        name="Simple",
        name_ja="シンプル",
        description="無料モデルで素早く。初めての方におすすめ。",
        default_writers=["gemini-flash", "llama-70b", "deepseek-chat"],
        default_matrix=[
            ("gemini-flash", "nikkei"),
            ("llama-70b", "lifestyle"),
            ("deepseek-chat", "web"),
            ("gemini-flash", "trade"),
            ("llama-70b", "tv"),
        ],
        default_editor="gemini-flash",
        estimated_time_min=1,
        estimated_cost_yen=0
    ),
    "standard": ModeConfig(
        id="standard",
        name="Standard",
        name_ja="おすすめ",
        description="バランス型。複数モデルで多角的な評価。",
        default_writers=["gemini-pro", "claude-haiku", "deepseek-chat"],
        default_matrix=[
            ("gemini-pro", "nikkei"),
            ("claude-haiku", "nikkei"),
            ("claude-haiku", "lifestyle"),
            ("deepseek-chat", "lifestyle"),
            ("gemini-pro", "web"),
            ("deepseek-chat", "web"),
            ("claude-haiku", "trade"),
            ("gemini-pro", "trade"),
            ("deepseek-chat", "tv"),
            ("gemini-pro", "tv"),
        ],
        default_editor="gemini-pro",
        estimated_time_min=2,
        estimated_cost_yen=30
    ),
    "full": ModeConfig(
        id="full",
        name="Full",
        name_ja="プロ",
        description="最高品質。Claude/GPT含む完全分析。",
        default_writers=["claude-sonnet", "gpt-4o", "gemini-pro", "deepseek-chat"],
        default_matrix=[
            (llm, persona)
            for llm in ["claude-sonnet", "gpt-4o", "gemini-pro", "deepseek-chat"]
            for persona in ["nikkei", "lifestyle", "web", "trade", "tv"]
        ],
        default_editor="claude-sonnet",
        estimated_time_min=5,
        estimated_cost_yen=150
    ),
}

# =============================================================================
# Criticism Level Configuration
# =============================================================================

CRITICISM_LEVELS = {
    1: {"name": "最寛容", "description": "ポジティブな評価傾向", "modifier": 0.5},
    2: {"name": "寛容", "description": "やや寛容な評価", "modifier": 0.75},
    3: {"name": "標準", "description": "バランスの取れた評価", "modifier": 1.0},
    4: {"name": "厳格", "description": "やや厳しい評価", "modifier": 1.25},
    5: {"name": "最厳格", "description": "細部まで厳しくチェック", "modifier": 1.5},
}

# =============================================================================
# Default Settings
# =============================================================================

DEFAULT_MODE = "standard"
DEFAULT_CRITICISM_LEVEL = 3

# Title generation model (fast model for generating conversation titles)
TITLE_GENERATION_MODEL = "google/gemini-3-pro-preview"

# =============================================================================
# Helper Functions
# =============================================================================

def get_llm_block(block_id: str) -> LLMBlock | None:
    """Get an LLM block by its ID."""
    return LLM_BLOCKS.get(block_id)


def get_persona(persona_id: str) -> JournalistPersona | None:
    """Get a journalist persona by its ID."""
    return JOURNALIST_PERSONAS.get(persona_id)


def get_mode_config(mode_id: str) -> ModeConfig | None:
    """Get a mode configuration by its ID."""
    return MODE_CONFIGS.get(mode_id)


def get_llm_model(block_id: str) -> str | None:
    """Get the OpenRouter model identifier for an LLM block."""
    block = get_llm_block(block_id)
    return block.model if block else None


def calculate_cost(writers: list[str], matrix: list[tuple[str, str]], editor: str) -> int:
    """Calculate estimated cost in Yen based on configuration."""
    cost = 0

    # Writer costs (each creates a draft)
    for w in writers:
        block = get_llm_block(w)
        if block:
            cost += 15 * block.cost_factor

    # Evaluation costs
    for llm_id, _ in matrix:
        block = get_llm_block(llm_id)
        if block:
            cost += 8 * block.cost_factor

    # Editor cost
    editor_block = get_llm_block(editor)
    if editor_block:
        cost += 20 * editor_block.cost_factor

    return int(cost)


def calculate_time(writers: list[str], matrix: list[tuple[str, str]]) -> int:
    """Calculate estimated time in minutes based on configuration."""
    # Rough estimate: writers run in parallel, evaluations run in parallel
    # Each stage takes about 30-60 seconds
    num_writers = len(writers)
    num_evals = len(matrix)

    # Parallel execution means we take the max, not sum
    return max(1, (num_writers + num_evals) // 6)


# =============================================================================
# API Response Helpers
# =============================================================================

def get_config_for_api() -> dict:
    """Get configuration data formatted for API response."""
    return {
        "llm_blocks": [
            {
                "id": block.id,
                "name": block.name,
                "description": block.description,
            }
            for block in LLM_BLOCKS.values()
        ],
        "personas": [
            {
                "id": persona.id,
                "name": persona.name,
                "media_type": persona.media_type,
            }
            for persona in JOURNALIST_PERSONAS.values()
        ],
        "modes": [
            {
                "id": config.id,
                "name": config.name_ja,
                "description": config.description,
                "estimated_time_min": config.estimated_time_min,
                "estimated_cost_yen": config.estimated_cost_yen,
            }
            for config in MODE_CONFIGS.values()
        ],
        "criticism_levels": CRITICISM_LEVELS,
        "default_mode": DEFAULT_MODE,
        "default_criticism_level": DEFAULT_CRITICISM_LEVEL,
    }
