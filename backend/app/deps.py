from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth_jwt import decode_supabase_access_token

_bearer = HTTPBearer(auto_error=False)


async def current_user_id(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> UUID:
    """Resolve Supabase `sub` after Bearer JWT verification."""
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    return decode_supabase_access_token(creds.credentials)
