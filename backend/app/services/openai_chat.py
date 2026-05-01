"""OpenAI Responses API streaming — Module 1 managed RAG via file_search."""

from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from typing import Any

from langsmith import traceable
from openai import OpenAI
from app.config import get_settings


def _sse(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


def _openai_client() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


@traceable(name="openai_responses_create_stream")
def _responses_create_stream(**kwargs: Any):
    # Trace spans the OpenAI HTTP stream lifecycle (see LangSmith UI).
    return _openai_client().responses.create(**kwargs)


def stream_responses_turn(
    *,
    user_text: str,
    previous_response_id: str | None,
    vector_store_id: str | None,
    on_complete: Callable[[str], None] | None = None,
) -> Iterator[str]:
    """
    Yields SSE strings for the client. Invokes on_complete before the final `done` chunk.
    Docs: https://platform.openai.com/docs/guides/text
    """
    s = get_settings()

    tools: list[dict[str, Any]] = []
    include: list[str] = []
    if vector_store_id:
        tools.append({"type": "file_search", "vector_store_ids": [vector_store_id]})
        include.append("file_search_call.results")

    kwargs: dict[str, Any] = {
        "model": s.openai_responses_model,
        "input": user_text,
        "stream": True,
        "instructions": (
            "You are a helpful assistant. When file_search results exist, "
            "answer from them and mention the source filenames."
        ),
    }
    if previous_response_id:
        kwargs["previous_response_id"] = previous_response_id
    if tools:
        kwargs["tools"] = tools
    if include:
        kwargs["include"] = include

    stream = _responses_create_stream(**kwargs)

    final_response_id: str | None = None
    citations: list[dict[str, Any]] = []

    for event in stream:
        et = getattr(event, "type", None)
        if et == "response.output_text.delta":
            delta = getattr(event, "delta", "") or ""
            if delta:
                yield _sse("token", {"text": delta})
        elif et == "response.completed":
            resp = getattr(event, "response", None)
            if resp is not None:
                final_response_id = resp.id
                for item in resp.output:
                    if getattr(item, "type", None) == "file_search_call":
                        for r in getattr(item, "results", None) or []:
                            citations.append(
                                {
                                    "filename": getattr(r, "filename", None),
                                    "file_id": getattr(r, "file_id", None),
                                    "score": getattr(r, "score", None),
                                    "snippet": (getattr(r, "text", None) or "")[:500],
                                }
                            )
        elif et == "error":
            msg = getattr(event, "message", "stream error")
            yield _sse("error", {"message": str(msg)})
            return
        elif et == "response.failed":
            resp = getattr(event, "response", None)
            err = getattr(resp, "error", None) if resp is not None else None
            detail = getattr(err, "message", None) if err is not None else "response.failed"
            yield _sse("error", {"message": str(detail)})
            return

    if final_response_id:
        if on_complete:
            on_complete(final_response_id)
        yield _sse("citations", {"items": citations})
        yield _sse("done", {"response_id": final_response_id})
    else:
        yield _sse("error", {"message": "No response id from OpenAI stream"})
