from uuid import UUID

import jwt
from fastapi import HTTPException, status

from app.config import get_settings


def decode_supabase_access_token(token: str) -> UUID:
    """Validate Supabase access JWT (HS256) and return auth user id."""
    s = get_settings()
    issuer = f"{str(s.supabase_url).rstrip('/')}/auth/v1"
    try:
        payload = jwt.decode(
            token,
            s.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
            issuer=issuer,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from e
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing subject")
    return UUID(sub)
