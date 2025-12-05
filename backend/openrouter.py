"""OpenRouter API client for making LLM requests."""

import httpx
from typing import List, Dict, Any, Optional
from .config import OPENROUTER_API_KEY, OPENROUTER_API_URL


class OpenRouterError(Exception):
    """Custom exception for OpenRouter API errors."""
    def __init__(self, message: str, code: int = None, is_credit_error: bool = False):
        super().__init__(message)
        self.message = message
        self.code = code
        self.is_credit_error = is_credit_error


async def query_model(
    model: str,
    messages: List[Dict[str, str]],
    timeout: float = 120.0,
    raise_on_error: bool = False,
    max_retries: int = 2
) -> Optional[Dict[str, Any]]:
    """
    Query a single model via OpenRouter API with retry logic.

    Args:
        model: OpenRouter model identifier (e.g., "openai/gpt-4o")
        messages: List of message dicts with 'role' and 'content'
        timeout: Request timeout in seconds
        raise_on_error: If True, raise OpenRouterError instead of returning None
        max_retries: Maximum number of retries for transient errors

    Returns:
        Response dict with 'content' and optional 'reasoning_details', or None if failed
    """
    import asyncio

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
    }

    last_error = None

    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(
                    OPENROUTER_API_URL,
                    headers=headers,
                    json=payload
                )
                response.raise_for_status()

                data = response.json()
                message = data['choices'][0]['message']

                if attempt > 0:
                    print(f"[OpenRouter] {model} succeeded on retry {attempt}")

                return {
                    'content': message.get('content'),
                    'reasoning_details': message.get('reasoning_details')
                }

        except httpx.TimeoutException as e:
            last_error = e
            print(f"[OpenRouter] Timeout querying model {model} (attempt {attempt + 1}/{max_retries + 1}): {e}")
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            if raise_on_error:
                raise OpenRouterError(f"タイムアウト: {model}への接続がタイムアウトしました", code=408)
            return None

        except httpx.HTTPStatusError as e:
            error_text = e.response.text
            status_code = e.response.status_code
            print(f"[OpenRouter] HTTP error querying model {model}: {status_code} - {error_text}")

            # Don't retry client errors (4xx) except rate limiting
            if status_code == 429 and attempt < max_retries:
                print(f"[OpenRouter] Rate limited, retrying in {2 ** attempt}s...")
                await asyncio.sleep(2 ** attempt)
                continue

            # Check for credit error (402)
            is_credit_error = status_code == 402
            if is_credit_error:
                error_msg = f"クレジット不足: OpenRouterのクレジットが不足しています。https://openrouter.ai/settings/credits でクレジットを追加してください。"
            elif status_code == 400:
                error_msg = f"無効なリクエスト: モデル {model} へのリクエストが無効です。"
            elif status_code == 401:
                error_msg = f"認証エラー: APIキーが無効です。"
            elif status_code == 429:
                error_msg = f"レート制限: リクエストが多すぎます。しばらく待ってから再試行してください。"
            else:
                error_msg = f"APIエラー ({status_code}): {model}"

            if raise_on_error:
                raise OpenRouterError(error_msg, code=status_code, is_credit_error=is_credit_error)
            return None

        except Exception as e:
            last_error = e
            print(f"[OpenRouter] Error querying model {model} (attempt {attempt + 1}/{max_retries + 1}): {type(e).__name__}: {e}")
            # Retry on connection errors
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            if raise_on_error:
                raise OpenRouterError(f"接続エラー: {type(e).__name__}: {e}")
            return None

    return None


async def query_models_parallel(
    models: List[str],
    messages: List[Dict[str, str]]
) -> Dict[str, Optional[Dict[str, Any]]]:
    """
    Query multiple models in parallel.

    Args:
        models: List of OpenRouter model identifiers
        messages: List of message dicts to send to each model

    Returns:
        Dict mapping model identifier to response dict (or None if failed)
    """
    import asyncio

    # Create tasks for all models
    tasks = [query_model(model, messages) for model in models]

    # Wait for all to complete
    responses = await asyncio.gather(*tasks)

    # Map models to their responses
    return {model: response for model, response in zip(models, responses)}
