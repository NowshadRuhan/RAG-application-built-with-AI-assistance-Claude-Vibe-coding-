from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import configure_langsmith_env, get_settings
from app.routers import conversations


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Process startup: sync LangSmith env vars before traffic hits traceable OpenAI calls."""
    configure_langsmith_env()
    yield


app = FastAPI(title="Agentic RAG API", lifespan=lifespan)

s = get_settings()
# Browser chat runs on FRONTEND_ORIGIN; keep this tight in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[str(s.frontend_origin)],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversations.router)


@app.get("/health")
def health():
    return {"ok": True}
