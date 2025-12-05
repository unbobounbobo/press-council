"""Evaluation logic for Press Release Council System.

This module handles the evaluation workflow including:
- Mode-based evaluation orchestration
- Custom matrix evaluation (model × persona)
- Ranking aggregation and analysis
"""

import asyncio
import re
from typing import Any

from .config import (
    get_mode_config,
    get_llm_block,
    get_persona,
    LLM_BLOCKS,
    JOURNALIST_PERSONAS,
    ModeConfig,
    DEFAULT_MODE,
    DEFAULT_CRITICISM_LEVEL,
)
from .openrouter import query_model, query_models_parallel, OpenRouterError
from .prompts import (
    WRITER_SYSTEM_PROMPT,
    WRITER_USER_PROMPT_TEMPLATE,
    build_reviewer_system_prompt,
    build_reviewer_user_prompt,
    EDITOR_SYSTEM_PROMPT,
    build_editor_prompt,
    create_label_mapping,
)


# =============================================================================
# Stage 1: Press Release Writing
# =============================================================================

async def stage1_write_drafts(
    user_input: str,
    writers: list[str] = None,
    mode_id: str = None
) -> list[dict]:
    """Stage 1: Multiple LLMs write press release drafts.

    Args:
        user_input: The user's press release request/information
        writers: List of LLM block IDs to use as writers (e.g., ["opus", "gpt", "gemini"])
        mode_id: Optional mode ID to use for default writers

    Returns:
        List of {"llm_id": str, "llm_name": str, "model": str, "content": str}
    """
    # Determine which writers to use
    if writers is None:
        if mode_id:
            config = get_mode_config(mode_id)
            if config:
                writers = config.default_writers
        if writers is None:
            writers = ["opus", "gpt", "gemini"]  # Default fallback

    # Validate and get LLM blocks
    valid_writers = []
    writer_models = []
    for llm_id in writers:
        block = get_llm_block(llm_id)
        if block:
            valid_writers.append(block)
            writer_models.append(block.model)

    if not valid_writers:
        raise ValueError("No valid writer models specified")

    # Build the writing prompt
    user_prompt = WRITER_USER_PROMPT_TEMPLATE.format(user_input=user_input)

    messages = [
        {"role": "system", "content": WRITER_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    # Query all writers in parallel
    responses = await query_models_parallel(writer_models, messages)

    # Build results with block info
    results = []
    for block in valid_writers:
        if block.model in responses and responses[block.model]:
            results.append({
                "llm_id": block.id,
                "llm_name": block.name,
                "model": block.model,
                "content": responses[block.model].get("content", "")
            })

    return results


# =============================================================================
# Stage 2: Journalist Evaluation
# =============================================================================

async def stage2_evaluate_drafts(
    drafts: list[dict],
    matrix: list[tuple[str, str]] = None,
    mode_id: str = None,
    criticism_level: int = None
) -> tuple[list[dict], dict[str, str]]:
    """Stage 2: Journalist personas evaluate the press release drafts.

    Args:
        drafts: Stage 1 results (list of {"llm_id", "llm_name", "model", "content"})
        matrix: List of (llm_id, persona_id) tuples defining who evaluates with which persona
        mode_id: Optional mode ID to use for default matrix
        criticism_level: Global criticism level (1-5), defaults to DEFAULT_CRITICISM_LEVEL

    Returns:
        Tuple of (evaluations, label_to_model_mapping)
        evaluations: List of {"llm_id": str, "llm_name": str, "persona_id": str, "persona_name": str, "evaluation": str, "parsed_ranking": list}
    """
    # Determine criticism level
    if criticism_level is None:
        criticism_level = DEFAULT_CRITICISM_LEVEL

    # Determine which matrix to use
    if matrix is None:
        if mode_id:
            config = get_mode_config(mode_id)
            if config:
                matrix = config.default_matrix
        if matrix is None:
            # Default fallback: each persona evaluates once with gemini
            matrix = [("gemini", pid) for pid in JOURNALIST_PERSONAS.keys()]

    # Create anonymous label mapping from drafts
    label_to_model = create_label_mapping(drafts, key="llm_id")

    if not matrix:
        return [], label_to_model

    # Prepare all evaluation tasks
    tasks = []
    task_info = []  # Track which task is which

    for llm_id, persona_id in matrix:
        block = get_llm_block(llm_id)
        persona = get_persona(persona_id)

        if not block or not persona:
            print(f"[Stage 2] Skipping invalid combo: llm={llm_id}, persona={persona_id}")
            continue

        # Build prompts for this evaluation
        system_prompt = build_reviewer_system_prompt(persona, criticism_level)
        user_prompt = build_reviewer_user_prompt(drafts, persona_id, anonymize=True)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        tasks.append(query_model(block.model, messages))
        task_info.append({
            "llm_id": llm_id,
            "llm_name": block.name,
            "model": block.model,
            "persona_id": persona_id,
            "persona_name": persona.name
        })

    # Execute all evaluations in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Process results
    evaluations = []
    for info, result in zip(task_info, results):
        if isinstance(result, Exception):
            print(f"[Stage 2] Error for {info['llm_name']}/{info['persona_name']}: {result}")
            continue
        if result is None:
            print(f"[Stage 2] No result for {info['llm_name']}/{info['persona_name']}")
            continue

        evaluation_text = result.get("content", "")
        parsed_ranking = parse_ranking_from_text(evaluation_text)

        evaluations.append({
            "llm_id": info["llm_id"],
            "llm_name": info["llm_name"],
            "model": info["model"],
            "persona_id": info["persona_id"],
            "persona_name": info["persona_name"],
            "evaluation": evaluation_text,
            "parsed_ranking": parsed_ranking
        })

    return evaluations, label_to_model


def parse_ranking_from_text(text: str) -> list[str]:
    """Extract ranking from evaluation text.

    Looks for "FINAL RANKING:" section and extracts ordered labels.

    Returns:
        List of labels in ranked order (e.g., ["案C", "案A", "案B"])
    """
    # Try to find FINAL RANKING section
    ranking_match = re.search(r'FINAL RANKING[：:]?\s*\n(.*?)(?:\n\n|\Z)', text, re.DOTALL | re.IGNORECASE)

    if ranking_match:
        ranking_section = ranking_match.group(1)
    else:
        # Fallback: search in the entire text
        ranking_section = text

    # Extract all "案X" patterns in order
    labels = re.findall(r'案([A-Z])', ranking_section)

    # Remove duplicates while preserving order
    seen = set()
    unique_labels = []
    for label in labels:
        full_label = f"案{label}"
        if full_label not in seen:
            seen.add(full_label)
            unique_labels.append(full_label)

    return unique_labels


# =============================================================================
# Stage 3: Editor Synthesis
# =============================================================================

async def stage3_synthesize(
    original_request: str,
    drafts: list[dict],
    evaluations: list[dict],
    editor: str = None,
    mode_id: str = None
) -> dict:
    """Stage 3: Editor synthesizes final press release.

    Args:
        original_request: Original user request
        drafts: Stage 1 results
        evaluations: Stage 2 results
        editor: LLM block ID to use as editor (e.g., "opus")
        mode_id: Optional mode ID to use for default editor

    Returns:
        {"llm_id": str, "llm_name": str, "model": str, "content": str}
    """
    # Determine which editor to use
    if editor is None:
        if mode_id:
            config = get_mode_config(mode_id)
            if config:
                editor = config.default_editor
        if editor is None:
            editor = "opus"  # Default fallback

    block = get_llm_block(editor)
    if not block:
        raise ValueError(f"Unknown editor LLM: {editor}")

    print(f"[Stage 3] Using editor: {block.name} ({block.model})")

    # Calculate aggregate rankings to pass to editor
    label_to_model = create_label_mapping(drafts, key="llm_id")
    aggregate_rankings = calculate_aggregate_rankings(evaluations, label_to_model)

    # Build editor prompt
    try:
        user_prompt = build_editor_prompt(
            original_request=original_request,
            drafts=drafts,
            evaluations=evaluations,
            rankings=aggregate_rankings
        )
        print(f"[Stage 3] Prompt length: {len(user_prompt)} chars")
    except Exception as e:
        print(f"[Stage 3] Error building prompt: {e}")
        return {
            "llm_id": editor,
            "llm_name": block.name,
            "model": block.model,
            "content": f"（プロンプト生成エラー: {e}）"
        }

    messages = [
        {"role": "system", "content": EDITOR_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]

    # Use longer timeout for Stage 3 as it processes a lot of data
    try:
        result = await query_model(block.model, messages, timeout=180.0, raise_on_error=True)
    except OpenRouterError as e:
        print(f"[Stage 3] OpenRouter error for {block.model}: {e.message}")
        return {
            "llm_id": editor,
            "llm_name": block.name,
            "model": block.model,
            "content": f"（{e.message}）",
            "error": True,
            "error_code": e.code,
            "is_credit_error": e.is_credit_error
        }

    if not result:
        print(f"[Stage 3] Model query failed for {block.model}")
        return {
            "llm_id": editor,
            "llm_name": block.name,
            "model": block.model,
            "content": "（編集長による最終版の生成に失敗しました。APIエラーの可能性があります。）",
            "error": True
        }

    return {
        "llm_id": editor,
        "llm_name": block.name,
        "model": block.model,
        "content": result.get("content", "")
    }


# =============================================================================
# Aggregation and Analysis
# =============================================================================

def calculate_aggregate_rankings(
    evaluations: list[dict],
    label_to_model: dict[str, str]
) -> list[dict]:
    """Calculate aggregate rankings across all evaluations.

    Args:
        evaluations: Stage 2 results with parsed_ranking
        label_to_model: Mapping from labels to model names/IDs

    Returns:
        List of {"label": str, "llm_id": str, "avg_rank": float, "rankings_count": int}
        sorted by avg_rank (lower is better)
    """
    # Collect all rankings for each label
    label_rankings: dict[str, list[int]] = {label: [] for label in label_to_model.keys()}

    for ev in evaluations:
        parsed = ev.get("parsed_ranking", [])
        for position, label in enumerate(parsed, start=1):
            if label in label_rankings:
                label_rankings[label].append(position)

    # Calculate averages
    results = []
    for label, rankings in label_rankings.items():
        if rankings:
            avg_rank = sum(rankings) / len(rankings)
            results.append({
                "label": label,
                "llm_id": label_to_model.get(label, ""),
                "avg_rank": round(avg_rank, 2),
                "rankings_count": len(rankings)
            })

    # Sort by average rank (lower is better)
    results.sort(key=lambda x: x["avg_rank"])
    return results


def calculate_persona_breakdown(
    evaluations: list[dict],
    label_to_model: dict[str, str]
) -> dict[str, list[dict]]:
    """Calculate rankings broken down by persona.

    Returns:
        Dict mapping persona_id to list of {"label": str, "llm_id": str, "avg_rank": float}
    """
    # Group evaluations by persona
    by_persona: dict[str, list[dict]] = {}

    for ev in evaluations:
        persona = ev.get("persona_id", "unknown")
        if persona not in by_persona:
            by_persona[persona] = []
        by_persona[persona].append(ev)

    # Calculate rankings for each persona
    results = {}
    for persona_id, persona_evals in by_persona.items():
        results[persona_id] = calculate_aggregate_rankings(persona_evals, label_to_model)

    return results


def build_cross_table(
    evaluations: list[dict],
    label_to_model: dict[str, str]
) -> dict:
    """Build a cross-table of rankings (reviewer model × persona × draft).

    Returns:
        {
            "headers": {"llms": [...], "personas": [...], "drafts": [...]},
            "data": {
                "llm_id": {
                    "persona_id": {
                        "draft_label": rank_position
                    }
                }
            }
        }
    """
    # Collect unique LLMs, personas, and draft labels
    llms = set()
    personas = set()
    drafts = set(label_to_model.keys())

    for ev in evaluations:
        llms.add(ev.get("llm_id", ""))
        personas.add(ev.get("persona_id", ""))

    # Build data structure
    data = {}
    for ev in evaluations:
        llm_id = ev.get("llm_id", "")
        persona = ev.get("persona_id", "")
        parsed = ev.get("parsed_ranking", [])

        if llm_id not in data:
            data[llm_id] = {}
        if persona not in data[llm_id]:
            data[llm_id][persona] = {}

        for position, label in enumerate(parsed, start=1):
            data[llm_id][persona][label] = position

    return {
        "headers": {
            "llms": sorted(list(llms)),
            "personas": sorted(list(personas)),
            "drafts": sorted(list(drafts))
        },
        "data": data
    }


# =============================================================================
# Full Workflow
# =============================================================================

async def run_press_release_workflow(
    user_input: str,
    writers: list[str] = None,
    matrix: list[tuple[str, str]] = None,
    editor: str = None,
    criticism_level: int = None,
    mode_id: str = None
) -> dict[str, Any]:
    """Run the complete press release workflow.

    Args:
        user_input: User's press release request
        writers: List of LLM block IDs for writing (overrides mode default)
        matrix: List of (llm_id, persona_id) for evaluation (overrides mode default)
        editor: LLM block ID for final synthesis (overrides mode default)
        criticism_level: Global criticism level 1-5 (overrides default)
        mode_id: Mode to use for defaults (simple, standard, full)

    Returns:
        {
            "stage1": [...],
            "stage2": [...],
            "stage3": {...},
            "metadata": {
                "mode": str,
                "criticism_level": int,
                "label_to_model": {...},
                "aggregate_rankings": [...],
                "persona_breakdown": {...},
                "cross_table": {...}
            }
        }
    """
    # Use default mode if none specified
    if mode_id is None:
        mode_id = DEFAULT_MODE

    config = get_mode_config(mode_id)

    # Get effective settings (custom overrides mode defaults)
    effective_writers = writers or (config.default_writers if config else ["opus", "gpt", "gemini"])
    effective_matrix = matrix or (config.default_matrix if config else [])
    effective_editor = editor or (config.default_editor if config else "opus")
    effective_criticism = criticism_level or DEFAULT_CRITICISM_LEVEL

    print(f"[Workflow] Mode: {mode_id}")
    print(f"[Workflow] Writers: {effective_writers}")
    print(f"[Workflow] Matrix size: {len(effective_matrix)}")
    print(f"[Workflow] Editor: {effective_editor}")
    print(f"[Workflow] Criticism level: {effective_criticism}")

    # Stage 1: Write drafts
    stage1_results = await stage1_write_drafts(
        user_input,
        writers=effective_writers,
        mode_id=mode_id
    )

    if not stage1_results:
        return {
            "stage1": [],
            "stage2": [],
            "stage3": {
                "llm_id": effective_editor,
                "llm_name": get_llm_block(effective_editor).name if get_llm_block(effective_editor) else "",
                "model": "",
                "content": "ドラフト作成に失敗しました"
            },
            "metadata": {"mode": mode_id, "error": "No drafts generated"}
        }

    # Stage 2: Evaluate drafts
    stage2_results, label_to_model = await stage2_evaluate_drafts(
        drafts=stage1_results,
        matrix=effective_matrix,
        mode_id=mode_id,
        criticism_level=effective_criticism
    )

    # Calculate analytics
    aggregate_rankings = calculate_aggregate_rankings(stage2_results, label_to_model)
    persona_breakdown = calculate_persona_breakdown(stage2_results, label_to_model)
    cross_table = build_cross_table(stage2_results, label_to_model)

    # Stage 3: Synthesize final
    stage3_result = await stage3_synthesize(
        original_request=user_input,
        drafts=stage1_results,
        evaluations=stage2_results,
        editor=effective_editor,
        mode_id=mode_id
    )

    return {
        "stage1": stage1_results,
        "stage2": stage2_results,
        "stage3": stage3_result,
        "metadata": {
            "mode": mode_id,
            "criticism_level": effective_criticism,
            "writers": effective_writers,
            "matrix": effective_matrix,
            "editor": effective_editor,
            "label_to_model": label_to_model,
            "aggregate_rankings": aggregate_rankings,
            "persona_breakdown": persona_breakdown,
            "cross_table": cross_table
        }
    }
