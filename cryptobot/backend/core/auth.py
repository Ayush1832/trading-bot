import secrets

from fastapi import Header, HTTPException, WebSocket, status

from backend.core.config import settings


def ensure_api_auth_token() -> tuple[str, bool]:
    """Return (token, was_generated). Generates and stores a random token on
    the settings singleton if none was configured via .env, so the control
    API is never left unprotected by omission."""
    if settings.api_auth_token:
        return settings.api_auth_token, False
    settings.api_auth_token = secrets.token_urlsafe(32)
    return settings.api_auth_token, True


async def require_api_key(x_api_key: str = Header(default="")):
    if not settings.api_auth_token or not secrets.compare_digest(x_api_key or "", settings.api_auth_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing API key")


def check_ws_api_key(websocket: WebSocket) -> bool:
    token = websocket.query_params.get("api_key", "")
    return bool(settings.api_auth_token) and secrets.compare_digest(token, settings.api_auth_token)
