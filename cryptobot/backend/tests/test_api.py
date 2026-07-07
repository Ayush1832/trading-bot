import pytest
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch


@pytest.fixture(scope="module")
def client():
    from backend.main import app
    from backend.core.config import settings
    with TestClient(app) as c:
        # Startup (lifespan) generates settings.api_auth_token if unset — every
        # /api route now requires it as X-API-Key.
        c.headers.update({"X-API-Key": settings.api_auth_token})
        yield c


def test_docs_endpoint(client):
    resp = client.get("/api/docs")
    assert resp.status_code == 200


def test_bot_status_requires_api_key(client):
    resp = client.get("/api/bot/status", headers={"X-API-Key": "wrong"})
    assert resp.status_code == 401


def test_bot_status(client):
    resp = client.get("/api/bot/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "running" in data
    assert "trade_open" in data


def test_get_trades_empty(client):
    resp = client.get("/api/trades")
    assert resp.status_code == 200
    data = resp.json()
    # Paginated shape: {"trades": [...], "total": n}
    assert isinstance(data, dict)
    assert isinstance(data["trades"], list)
    assert isinstance(data["total"], int)
    assert data["total"] >= len(data["trades"])


def test_get_stats(client):
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_trades" in data


def test_get_equity_curve(client):
    resp = client.get("/api/stats/equity-curve")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_daily_stats(client):
    resp = client.get("/api/stats/daily")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_config(client):
    resp = client.get("/api/config")
    assert resp.status_code == 200
    data = resp.json()
    assert "symbol" in data
    assert "trade_usdt" in data


def test_get_logs(client):
    resp = client.get("/api/logs")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_trade_not_found(client):
    resp = client.get("/api/trades/999999")
    assert resp.status_code == 404


def test_start_bot_no_exchange(client):
    resp = client.post("/api/bot/start")
    assert resp.status_code == 200


def test_stop_bot(client):
    resp = client.post("/api/bot/stop")
    assert resp.status_code == 200
