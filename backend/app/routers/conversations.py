"""Conversations + streaming chat + vector-store file uploads."""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from openai import OpenAI
from pydantic import BaseModel

from app.config import get_settings
from app.deps import current_user_id
from app.services import db
from app.services.openai_chat import stream_responses_turn

router = APIRouter(prefix="/api", tags=["api"])

_safe_name = re.compile(r"[^a-zA-Z0-9._-]+")


class ConversationCreateBody(BaseModel):
    title: str | None = None


class MessageBody(BaseModel):
    text: str


ALLOWED_UPLOAD_SUFFIXES = {".txt", ".pdf", ".md", ".csv", ".html"}


def _openai() -> OpenAI:
    return OpenAI(api_key=get_settings().openai_api_key)


@router.get("/me")
def api_me(user_id: UUID = Depends(current_user_id)):
    return {"user_id": str(user_id)}


@router.post("/conversations")
def create_conversation(body: ConversationCreateBody, user_id: UUID = Depends(current_user_id)):
    # One vector store per conversation — keeps file_search scoped to this thread.
    vs = _openai().vector_stores.create(name=f"conversation-{user_id}")
    row = db.insert_conversation(user_id, body.title, vs.id)
    return row


@router.get("/conversations")
def list_conversations(user_id: UUID = Depends(current_user_id)):
    return db.list_conversations(user_id)


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: UUID,
    body: MessageBody,
    user_id: UUID = Depends(current_user_id),
):
    conv = db.get_conversation(user_id, conversation_id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty message")

    prev = conv.get("openai_previous_response_id")
    vs_id = conv.get("openai_vector_store_id")

    db.touch_title_if_empty(user_id, conversation_id, text)

    def persist_previous(response_id: str) -> None:
        db.update_previous_response(user_id, conversation_id, response_id)

    gen = stream_responses_turn(
        user_text=text,
        previous_response_id=prev,
        vector_store_id=vs_id,
        on_complete=persist_previous,
    )

    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/conversations/{conversation_id}/files")
async def upload_conversation_file(
    conversation_id: UUID,
    user_id: UUID = Depends(current_user_id),
    upload: UploadFile = File(...),
):
    conv = db.get_conversation(user_id, conversation_id)
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    vs_id = conv.get("openai_vector_store_id")
    if not vs_id:
        raise HTTPException(status_code=400, detail="No vector store for conversation")

    raw_name = upload.filename or "upload"
    suffix = Path(raw_name).suffix.lower()
    if suffix not in ALLOWED_UPLOAD_SUFFIXES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported type {suffix!r}; allowed: {sorted(ALLOWED_UPLOAD_SUFFIXES)}",
        )

    data = await upload.read()
    max_b = get_settings().max_upload_bytes
    if len(data) > max_b:
        raise HTTPException(status_code=400, detail=f"File too large (max {max_b} bytes)")

    safe = _safe_name.sub("_", Path(raw_name).name)[:200] or "upload.txt"

    # In-memory file avoids temp disk paths; OpenAI SDK accepts (filename, binary_io).
    buf = BytesIO(data)
    client = _openai()
    client.vector_stores.files.upload_and_poll(vector_store_id=vs_id, file=(safe, buf))

    return {"ok": True, "filename": safe}
