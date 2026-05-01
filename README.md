# RAG-application-built-with-AI-assistance-(Claude-Vibe-coding)

Build an agentic RAG application from scratch by collaborating with Claude Code. 

## What This Is

A hands-on course where you collaborate with Claude Code to build a full-featured RAG system. You're not the one writing code—Claude is. Your job is to guide it, understand what you're building, and course-correct when needed.

**You don't need to know how to code.** You do need to be technically minded and willing to learn about APIs, databases, and system architecture.

## What You'll Build

- **Chat interface** with threaded conversations, streaming, tool calls, and subagent reasoning
- **Document ingestion** with drag-and-drop upload and processing status
- **Full RAG pipeline**: chunking, embedding, hybrid search, reranking
- **Agentic patterns**: text-to-SQL, web search, subagents with isolated context

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Tailwind, shadcn-style UI, Vite |
| Backend | Python, FastAPI |
| Database | Supabase (Postgres + pgvector + Auth + Storage) |
| Doc Processing | Docling |
| AI Models | Local (LM Studio) or Cloud (OpenAI, OpenRouter) |
| Observability | LangSmith |

## Module 1 — Local development

**Implemented in this repo:** Supabase Auth (browser), FastAPI JWT verification, Postgres `conversations` table with RLS, OpenAI **Responses API** streaming + **`previous_response_id`**, **file_search** via **one vector store per conversation**, LangSmith tracing on the OpenAI stream call, minimal React chat UI with SSE + file attach.

### Prerequisites

1. [Supabase](https://supabase.com/) project with **Email** auth enabled (password and/or magic link).
2. Run the SQL migration: paste `supabase/migrations/20260502000000_conversations.sql` into the Supabase SQL editor (or use the Supabase CLI if you use it locally).
3. OpenAI API key with **Responses** + **vector stores / file search** access.
4. [LangSmith](https://smith.langchain.com/) API key and project (set `LANGSMITH_TRACING=true`).

### Environment

Copy `.env.example` to **`backend/.env`** and **`frontend/.env`** (same keys split by prefix):

| Variables | Where |
|-----------|--------|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` | `frontend/.env` |
| `SUPABASE_*`, `OPENAI_*`, `FRONTEND_ORIGIN`, `LANGSMITH_*` | `backend/.env` |

**JWT verification:** backend uses **HS256** with `SUPABASE_JWT_SECRET` from Supabase → **Settings → API → JWT Secret** (JWT Signing Keys → legacy secret). The expected issuer is `{SUPABASE_URL}/auth/v1` and audience `authenticated`. If verification fails after rotating keys, confirm those values match Supabase’s docs for your project.

**CORS:** `FRONTEND_ORIGIN` must match the URL where Vite runs (default `http://127.0.0.1:5173`).

### Commands

```bash
# Backend (from backend/)
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Frontend (from frontend/)
npm install
npm run dev
```

Smoke checks:

- `curl -s http://127.0.0.1:8000/health` → `{"ok":true}`
- Sign in on the UI → **New chat** → send a message → streamed assistant reply
- Optional: **Attach file** (`.txt`, `.pdf`, `.md`, `.csv`, `.html`), then ask something grounded in that file
- LangSmith project shows a trace for `openai_responses_create_stream`

When everything above works, mark Module 1 complete in [`PROGRESS.md`](./PROGRESS.md).

## The 8 Modules

1. **App Shell** — Auth, chat UI, managed RAG with OpenAI Responses API
2. **BYO Retrieval + Memory** — Ingestion, pgvector, switch to generic completions API
3. **Record Manager** — Content hashing, deduplication
4. **Metadata Extraction** — LLM-extracted metadata, filtered retrieval
5. **Multi-Format Support** — PDF, DOCX, HTML, Markdown via Docling
6. **Hybrid Search & Reranking** — Keyword + vector search, RRF, reranking
7. **Additional Tools** — Text-to-SQL, web search fallback
8. **Subagents** — Isolated context, document analysis delegation

## Getting Started (course)

1. Clone this repo
2. Install [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
3. Open in your IDE (Cursor, VS Code, etc.)
4. Run `claude` in the terminal
5. Use the `/onboard` command to get started

## Docs

- [PRD.md](./PRD.md) — What to build (the 8 modules in detail)
- [CLAUDE.md](./CLAUDE.md) — Context for Claude Code
- [PROGRESS.md](./PROGRESS.md) — Track your build progress


