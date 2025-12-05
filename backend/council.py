"""3-stage Press Council orchestration.

This module provides the main workflow functions and title generation.
"""

from typing import List, Dict, Any, Tuple
from .openrouter import query_model
from .config import TITLE_GENERATION_MODEL
from .prompts import TITLE_GENERATION_PROMPT
from .evaluation import run_press_release_workflow


# =============================================================================
# Title Generation
# =============================================================================

async def generate_conversation_title(user_query: str) -> str:
    """
    Generate a short title for a conversation based on the first user message.

    Args:
        user_query: The first user message

    Returns:
        A short title (3-5 words in Japanese)
    """
    title_prompt = TITLE_GENERATION_PROMPT.format(content=user_query)

    messages = [{"role": "user", "content": title_prompt}]

    # Use configured title generation model
    response = await query_model(TITLE_GENERATION_MODEL, messages, timeout=30.0)

    if response is None:
        # Fallback to a generic title
        return "新規プレスリリース"

    title = response.get('content', '新規プレスリリース').strip()

    # Clean up the title - remove quotes, limit length
    title = title.strip('"\'')

    # Truncate if too long
    if len(title) > 50:
        title = title[:47] + "..."

    return title


# =============================================================================
# Main Workflow Entry Point
# =============================================================================

async def run_press_release_council(
    user_input: str,
    mode_id: str = None,
    writers: List[str] = None,
    matrix: List[Tuple[str, str]] = None,
    editor: str = None,
    criticism_level: int = None
) -> Tuple[List, List, Dict, Dict]:
    """
    Run the press release workflow.

    Args:
        user_input: User's press release request
        mode_id: Mode to use (simple, standard, full)
        writers: Custom list of writer LLM IDs
        matrix: Custom evaluation matrix [(llm_id, persona_id), ...]
        editor: Custom editor LLM ID
        criticism_level: Global criticism level (1-5)

    Returns:
        Tuple of (stage1_results, stage2_results, stage3_result, metadata)
    """
    result = await run_press_release_workflow(
        user_input=user_input,
        writers=writers,
        matrix=matrix,
        editor=editor,
        criticism_level=criticism_level,
        mode_id=mode_id
    )

    return (
        result["stage1"],
        result["stage2"],
        result["stage3"],
        result["metadata"]
    )
