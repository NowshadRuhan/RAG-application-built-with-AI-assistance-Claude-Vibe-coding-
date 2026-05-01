from functools import lru_cache

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Env-driven config; keep secrets out of code."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"

    supabase_url: AnyHttpUrl
    supabase_service_role_key: str
    # JWT secret from Supabase Dashboard → Settings → API → JWT Secret (HS256)
    supabase_jwt_secret: str

    openai_api_key: str
    openai_responses_model: str = "gpt-4o"

    frontend_origin: AnyHttpUrl

    langsmith_tracing: bool = False
    langsmith_api_key: str | None = None
    langsmith_project: str | None = None

    # Upload guardrails for OpenAI file_search ingestion
    max_upload_bytes: int = 10 * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


def configure_langsmith_env() -> None:
    """LangSmith reads tracing flags from the environment at client init time."""
    s = get_settings()
    import os

    if s.langsmith_tracing and s.langsmith_api_key:
        os.environ["LANGSMITH_TRACING"] = "true"
        os.environ["LANGSMITH_API_KEY"] = s.langsmith_api_key
        if s.langsmith_project:
            os.environ["LANGSMITH_PROJECT"] = s.langsmith_project
