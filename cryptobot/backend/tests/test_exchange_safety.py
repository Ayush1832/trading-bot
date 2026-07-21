"""Unit tests for the exchange-side safety logic added in the hardening pass:
resting stop-loss construction and the fill-poll cancel/re-check path."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.exchange import MexcExchange


def _make_exchange():
    """MexcExchange with its ccxt client swapped for a controllable mock."""
    ex = MexcExchange(api_key="", api_secret="", sandbox=False)
    mock = MagicMock()
    # precision helpers are sync in ccxt
    mock.amount_to_precision = lambda symbol, qty: str(qty)
    mock.price_to_precision = lambda symbol, price: str(price)
    ex.exchange = mock
    return ex, mock


def test_place_stop_loss_raises_not_implemented_on_mexc_spot():
    # MEXC spot has no exchange-side conditional/trigger orders (only its
    # derivatives markets do) — place_stop_loss must fail loudly so the
    # caller's best-effort wrapper (_place_exchange_stop) falls back to the
    # in-process trailing stop instead of silently doing nothing.
    ex, mock = _make_exchange()
    mock.create_order = AsyncMock(return_value={"id": "sl-123"})

    with pytest.raises(NotImplementedError):
        asyncio.run(ex.place_stop_loss("ETH/USDT", 0.01, 1500.0))

    mock.create_order.assert_not_called()


def test_check_order_filled_rechecks_when_cancel_fails():
    """If the timeout cancel fails because the order actually filled, the
    method must detect the fill instead of abandoning a live/filled order."""
    ex, mock = _make_exchange()
    # timeout=0 skips the poll loop entirely → cancel is attempted, fails, then a
    # single re-check fetch sees the order actually filled.
    mock.fetch_order = AsyncMock(return_value={
        "status": "closed", "filled": 1, "amount": 1, "average": 1501.5, "price": 1501.5,
    })
    mock.cancel_order = AsyncMock(side_effect=Exception("order already filled"))

    result = asyncio.run(ex.check_order_filled("ETH/USDT", "ord-1", timeout=0))
    assert result == (pytest.approx(1501.5), pytest.approx(1))


def test_check_order_filled_returns_none_when_cancelled_clean():
    ex, mock = _make_exchange()
    mock.fetch_order = AsyncMock(return_value={"status": "open", "filled": 0, "amount": 1})
    mock.cancel_order = AsyncMock(return_value=True)

    result = asyncio.run(ex.check_order_filled("ETH/USDT", "ord-2", timeout=0))
    assert result is None


def test_check_order_filled_reports_partial_fill_after_cancel():
    """A timeout cancel only cancels the unfilled remainder — if part of the
    order already filled, that partial position must be reported back (not
    swallowed as 'no fill'), so the caller can track and protect it."""
    ex, mock = _make_exchange()
    mock.fetch_order = AsyncMock(return_value={
        "status": "open", "filled": 0.4, "amount": 1, "average": 1502.0, "price": 1502.0,
    })
    mock.cancel_order = AsyncMock(return_value=True)

    result = asyncio.run(ex.check_order_filled("ETH/USDT", "ord-3", timeout=0))
    assert result == (pytest.approx(1502.0), pytest.approx(0.4))
