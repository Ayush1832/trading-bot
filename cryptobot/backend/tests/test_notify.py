import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from backend.notify import TelegramNotifier


@pytest.fixture
def notifier_no_token():
    return TelegramNotifier(token="", chat_id="")


@pytest.fixture
def notifier_with_mock():
    n = TelegramNotifier.__new__(TelegramNotifier)
    n.token = "fake_token"
    n.chat_id = "123456"
    n._bot = AsyncMock()
    n._bot.send_message = AsyncMock()
    return n


@pytest.mark.asyncio
async def test_send_no_token_no_crash(notifier_no_token):
    await notifier_no_token.send_bot_started()
    await notifier_no_token.send_error("test error")


@pytest.mark.asyncio
async def test_send_test_message(notifier_with_mock):
    await notifier_with_mock.send_test_message()
    notifier_with_mock._bot.send_message.assert_called_once()
    call_kwargs = notifier_with_mock._bot.send_message.call_args[1]
    assert "✅" in call_kwargs["text"]


@pytest.mark.asyncio
async def test_send_trade_opened(notifier_with_mock):
    trade = {
        "symbol": "BTC/USDT",
        "entry_price": 43250.0,
        "qty": 0.0000231,
        "take_profit_price": 43769.0,
        "hard_sl_price": 42904.0,
        "trail_pct": 0.008,
    }
    await notifier_with_mock.send_trade_opened(trade)
    notifier_with_mock._bot.send_message.assert_called_once()
    text = notifier_with_mock._bot.send_message.call_args[1]["text"]
    assert "TRADE OPENED" in text
    assert "BTC/USDT" in text


@pytest.mark.asyncio
async def test_send_trade_closed_win(notifier_with_mock):
    from datetime import datetime
    trade = {
        "symbol": "BTC/USDT",
        "entry_price": 43250.0,
        "exit_price": 43820.0,
        "peak_price": 43900.0,
        "pnl_usdt": 0.013,
        "pnl_pct": 1.31,
        "exit_reason": "TRAILING_SL",
        "entry_time": datetime(2024, 1, 1, 14, 32, 5),
        "exit_time": datetime(2024, 1, 1, 14, 40, 27),
    }
    await notifier_with_mock.send_trade_closed(trade)
    text = notifier_with_mock._bot.send_message.call_args[1]["text"]
    assert "WIN" in text or "LOSS" in text
