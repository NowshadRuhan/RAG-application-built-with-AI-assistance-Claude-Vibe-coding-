from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from supabase import Client, create_client

from app.config import get_settings


def _client() -> Client:
    s = get_settings()
    return create_client(str(s.supabase_url), s.supabase_service_role_key)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def insert_conversation(user_id: UUID, title: str | None, openai_vector_store_id: str) -> dict[str, Any]:
    row = {
        "user_id": str(user_id),
        "title": title,
        "openai_vector_store_id": openai_vector_store_id,
    }
    res = _client().table("conversations").insert(row).execute()
    if not res.data:
        raise RuntimeError("insert conversation failed")
    return res.data[0]


def list_conversations(user_id: UUID) -> list[dict[str, Any]]:
    res = (
        _client()
        .table("conversations")
        .select("*")
        .eq("user_id", str(user_id))
        .order("updated_at", desc=True)
        .execute()
    )
    return list(res.data or [])


def get_conversation(user_id: UUID, conversation_id: UUID) -> dict[str, Any] | None:
    res = (
        _client()
        .table("conversations")
        .select("*")
        .eq("user_id", str(user_id))
        .eq("id", str(conversation_id))
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def update_previous_response(user_id: UUID, conversation_id: UUID, previous_response_id: str) -> None:
    _client().table("conversations").update(
        {"openai_previous_response_id": previous_response_id, "updated_at": _now_iso()}
    ).eq("user_id", str(user_id)).eq("id", str(conversation_id)).execute()


def touch_title_if_empty(user_id: UUID, conversation_id: UUID, title: str) -> None:
    row = get_conversation(user_id, conversation_id)
    if row and not row.get("title"):
        _client().table("conversations").update({"title": title[:120], "updated_at": _now_iso()}).eq(
            "user_id", str(user_id)
        ).eq("id", str(conversation_id)).execute()
