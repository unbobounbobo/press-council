"""FastAPI backend for Press Council."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import uuid
import json
import asyncio

from . import storage
from .council import generate_conversation_title
from .config import (
    MODE_CONFIGS,
    LLM_BLOCKS,
    JOURNALIST_PERSONAS,
    CRITICISM_LEVELS,
    DEFAULT_MODE,
    DEFAULT_CRITICISM_LEVEL,
    get_mode_config,
    get_config_for_api,
)
from .evaluation import (
    stage1_write_drafts,
    stage2_evaluate_drafts,
    stage3_synthesize,
    calculate_aggregate_rankings,
    calculate_persona_breakdown,
    build_cross_table,
    run_press_release_workflow,
)

app = FastAPI(title="Press Council API")

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Request/Response Models
# =============================================================================

class CreateConversationRequest(BaseModel):
    """Request to create a new conversation."""
    pass


class PressReleaseRequest(BaseModel):
    """Request to create a press release with custom configuration."""
    content: str
    mode: Optional[str] = None  # simple, standard, full
    writers: Optional[List[str]] = None  # ["opus", "gpt", "gemini"]
    matrix: Optional[List[List[str]]] = None  # [["opus", "nikkei"], ["gpt", "lifestyle"]]
    editor: Optional[str] = None  # "opus"
    criticism_level: Optional[int] = Field(None, ge=1, le=5)


class ConversationMetadata(BaseModel):
    """Conversation metadata for list view."""
    id: str
    created_at: str
    title: str
    message_count: int


class Conversation(BaseModel):
    """Full conversation with all messages."""
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]


# =============================================================================
# Configuration Endpoints
# =============================================================================

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "Press Council API"}


@app.get("/api/config")
async def get_full_config():
    """Get complete configuration for the frontend."""
    return get_config_for_api()


@app.get("/api/config/modes")
async def get_modes():
    """Get available modes and their configurations."""
    modes = []
    for mode_id, config in MODE_CONFIGS.items():
        modes.append({
            "id": config.id,
            "name": config.name,
            "name_ja": config.name_ja,
            "description": config.description,
            "default_writers": config.default_writers,
            "default_matrix": config.default_matrix,
            "default_editor": config.default_editor,
            "estimated_time_min": config.estimated_time_min,
            "estimated_cost_yen": config.estimated_cost_yen,
        })
    return {
        "modes": modes,
        "default_mode": DEFAULT_MODE
    }


@app.get("/api/config/llm-blocks")
async def get_llm_blocks():
    """Get available LLM blocks."""
    blocks = []
    for block_id, block in LLM_BLOCKS.items():
        blocks.append({
            "id": block.id,
            "name": block.name,
            "model": block.model,
            "provider": block.provider,
            "tier": block.tier,
            "description": block.description,
            "cost_factor": block.cost_factor,
        })
    return {"blocks": blocks}


@app.get("/api/config/personas")
async def get_personas():
    """Get available journalist personas."""
    personas = []
    for persona_id, persona in JOURNALIST_PERSONAS.items():
        personas.append({
            "id": persona.id,
            "name": persona.name,
            "media_type": persona.media_type,
            "outlet_example": persona.outlet_example,
            "focus_areas": persona.focus_areas,
            "tone": persona.tone,
            "description": persona.description,
            "criticism_base": persona.criticism_base,
        })
    return {"personas": personas}


@app.get("/api/config/criticism-levels")
async def get_criticism_levels():
    """Get available criticism levels."""
    return {
        "levels": CRITICISM_LEVELS,
        "default": DEFAULT_CRITICISM_LEVEL
    }


# =============================================================================
# Conversation Endpoints
# =============================================================================

@app.get("/api/conversations", response_model=List[ConversationMetadata])
async def list_conversations():
    """List all conversations (metadata only)."""
    return storage.list_conversations()


@app.post("/api/conversations", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest):
    """Create a new conversation."""
    conversation_id = str(uuid.uuid4())
    conversation = storage.create_conversation(conversation_id)
    return conversation


@app.get("/api/conversations/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a specific conversation with all its messages."""
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation."""
    success = storage.delete_conversation(conversation_id)
    if not success:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"status": "deleted"}


# =============================================================================
# Press Release Endpoints
# =============================================================================

@app.post("/api/conversations/{conversation_id}/press-release")
async def create_press_release(conversation_id: str, request: PressReleaseRequest):
    """
    Create a press release using the 3-stage council process.
    Returns the complete response with all stages.
    """
    # Check if conversation exists
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Determine mode
    mode_id = request.mode or DEFAULT_MODE
    if mode_id not in MODE_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {mode_id}")

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Add user message
    storage.add_user_message(conversation_id, request.content)

    # If this is the first message, generate a title
    if is_first_message:
        title = await generate_conversation_title(request.content)
        storage.update_conversation_title(conversation_id, title)

    # Convert matrix from list of lists to list of tuples
    matrix = None
    if request.matrix:
        matrix = [(m[0], m[1]) for m in request.matrix if len(m) >= 2]

    # Run the press release workflow
    result = await run_press_release_workflow(
        user_input=request.content,
        writers=request.writers,
        matrix=matrix,
        editor=request.editor,
        criticism_level=request.criticism_level,
        mode_id=mode_id
    )

    # Add assistant message with all stages
    storage.add_assistant_message(
        conversation_id,
        result["stage1"],
        result["stage2"],
        result["stage3"]
    )

    return result


@app.post("/api/conversations/{conversation_id}/press-release/stream")
async def create_press_release_stream(conversation_id: str, request: PressReleaseRequest):
    """
    Create a press release with streaming progress updates.
    Returns Server-Sent Events as each stage completes.
    """
    # Check if conversation exists
    conversation = storage.get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Determine mode
    mode_id = request.mode or DEFAULT_MODE
    if mode_id not in MODE_CONFIGS:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {mode_id}")

    mode_config = get_mode_config(mode_id)

    # Check if this is the first message
    is_first_message = len(conversation["messages"]) == 0

    # Convert matrix from list of lists to list of tuples
    matrix = None
    if request.matrix:
        matrix = [(m[0], m[1]) for m in request.matrix if len(m) >= 2]

    # Get effective settings
    effective_writers = request.writers or (mode_config.default_writers if mode_config else [])
    effective_matrix = matrix or (mode_config.default_matrix if mode_config else [])
    effective_editor = request.editor or (mode_config.default_editor if mode_config else "opus")
    effective_criticism = request.criticism_level or DEFAULT_CRITICISM_LEVEL

    async def event_generator():
        try:
            # Add user message
            storage.add_user_message(conversation_id, request.content)

            # Send config info
            yield f"data: {json.dumps({'type': 'config', 'data': {'mode': mode_id, 'writers': effective_writers, 'matrix_size': len(effective_matrix), 'editor': effective_editor, 'criticism_level': effective_criticism}})}\n\n"

            # Start title generation in parallel (don't await yet)
            title_task = None
            if is_first_message:
                title_task = asyncio.create_task(generate_conversation_title(request.content))

            # Stage 1: Write drafts
            yield f"data: {json.dumps({'type': 'stage1_start', 'data': {'writer_count': len(effective_writers), 'writers': effective_writers}})}\n\n"

            stage1_results = await stage1_write_drafts(
                request.content,
                writers=effective_writers,
                mode_id=mode_id
            )
            yield f"data: {json.dumps({'type': 'stage1_complete', 'data': stage1_results})}\n\n"

            # Stage 2: Evaluate drafts
            yield f"data: {json.dumps({'type': 'stage2_start', 'data': {'evaluation_count': len(effective_matrix)}})}\n\n"

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

            yield f"data: {json.dumps({'type': 'stage2_complete', 'data': stage2_results, 'metadata': {'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings, 'persona_breakdown': persona_breakdown, 'cross_table': cross_table}})}\n\n"

            # Stage 3: Synthesize final press release
            yield f"data: {json.dumps({'type': 'stage3_start', 'data': {'editor': effective_editor}})}\n\n"

            stage3_result = await stage3_synthesize(
                original_request=request.content,
                drafts=stage1_results,
                evaluations=stage2_results,
                editor=effective_editor,
                mode_id=mode_id
            )
            yield f"data: {json.dumps({'type': 'stage3_complete', 'data': stage3_result})}\n\n"

            # Wait for title generation if it was started
            if title_task:
                title = await title_task
                storage.update_conversation_title(conversation_id, title)
                yield f"data: {json.dumps({'type': 'title_complete', 'data': {'title': title}})}\n\n"

            # Save complete assistant message
            storage.add_assistant_message(
                conversation_id,
                stage1_results,
                stage2_results,
                stage3_result
            )

            # Send completion event with full metadata
            yield f"data: {json.dumps({'type': 'complete', 'metadata': {'mode': mode_id, 'criticism_level': effective_criticism, 'writers': effective_writers, 'matrix': effective_matrix, 'editor': effective_editor, 'label_to_model': label_to_model, 'aggregate_rankings': aggregate_rankings, 'persona_breakdown': persona_breakdown, 'cross_table': cross_table}})}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            # Send error event
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


# =============================================================================
# Legacy Endpoints (Backward Compatibility)
# =============================================================================

class LegacySendMessageRequest(BaseModel):
    """Legacy request model for backward compatibility."""
    content: str
    mode: Optional[str] = None


@app.post("/api/conversations/{conversation_id}/message")
async def send_message_legacy(conversation_id: str, request: LegacySendMessageRequest):
    """
    Send a message and run the press release process (legacy endpoint).
    Redirects to the new press-release endpoint.
    """
    pr_request = PressReleaseRequest(content=request.content, mode=request.mode)
    return await create_press_release(conversation_id, pr_request)


@app.post("/api/conversations/{conversation_id}/message/stream")
async def send_message_stream_legacy(conversation_id: str, request: LegacySendMessageRequest):
    """
    Stream the press release process (legacy endpoint).
    Redirects to the new press-release/stream endpoint.
    """
    pr_request = PressReleaseRequest(content=request.content, mode=request.mode)
    return await create_press_release_stream(conversation_id, pr_request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
