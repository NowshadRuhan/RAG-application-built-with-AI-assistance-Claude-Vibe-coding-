# Backend (FastAPI)

Module 1 uses the **OpenAI Responses API** with `previous_response_id` stored in Postgres (`conversations.openai_previous_response_id`). OpenAI retains conversation state; we only persist the last response id for continuity.

In **Module 2**, this path is replaced with Chat Completions + your own retrieval (`pgvector`) and explicit chat history in the database.

## Run locally

From `backend/` with a `.env` matching the root `.env.example`:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check: `curl -s http://127.0.0.1:8000/health`

API routes are under `/api/*` and expect `Authorization: Bearer <Supabase access_token>`.
