import asyncio
import logging
from typing import Optional
import ccxt.async_support as ccxt
import pandas as pd

logger = logging.getLogger(__name__)

EXCHANGE_TIMEOUT = 10  # seconds for all API calls


class BybitExchange:
    def __init__(self, api_key: str, api_secret: str, sandbox: bool = False):
        self.exchange = ccxt.bybit({
            "apiKey": api_key,
            "secret": api_secret,
            "enableRateLimit": True,
            "options": {
                "defaultType": "spot",
                "defaultCategory": "spot",  # Bybit V5 API category
            },
        })
        if sandbox:
            self.exchange.set_sandbox_mode(True)
        self._min_amounts: dict = {}

    async def close(self):
        await self.exchange.close()

    async def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 60) -> pd.DataFrame:
        raw = await asyncio.wait_for(
            self.exchange.fetch_ohlcv(symbol, timeframe, limit=limit),
            timeout=EXCHANGE_TIMEOUT,
        )
        df = pd.DataFrame(raw, columns=["ts", "open", "high", "low", "close", "volume"])
        df["ts"] = pd.to_datetime(df["ts"], unit="ms")
        return df

    async def fetch_ohlcv_range(
        self, symbol: str, timeframe: str, since_ms: int, limit: int = 1000
    ) -> pd.DataFrame:
        raw = await asyncio.wait_for(
            self.exchange.fetch_ohlcv(symbol, timeframe, since=since_ms, limit=limit),
            timeout=EXCHANGE_TIMEOUT,
        )
        df = pd.DataFrame(raw, columns=["ts", "open", "high", "low", "close", "volume"])
        df["ts"] = pd.to_datetime(df["ts"], unit="ms")
        return df

    async def fetch_ticker(self, symbol: str) -> dict:
        ticker = await asyncio.wait_for(
            self.exchange.fetch_ticker(symbol),
            timeout=EXCHANGE_TIMEOUT,
        )
        return {
            "bid": ticker.get("bid"),
            "ask": ticker.get("ask"),
            "last": ticker.get("last"),
            "volume": ticker.get("quoteVolume"),
        }

    async def get_balance(self) -> dict:
        # Bybit Unified Trading Account returns balances under 'UNIFIED' type;
        # passing type='spot' ensures we read the spot wallet specifically.
        balance = await asyncio.wait_for(
            self.exchange.fetch_balance({"type": "spot"}),
            timeout=EXCHANGE_TIMEOUT,
        )
        usdt = balance.get("USDT", {})
        return {
            "USDT": {
                "free": usdt.get("free", 0),
                "used": usdt.get("used", 0),
                "total": usdt.get("total", 0),
            }
        }

    async def place_limit_buy(self, symbol: str, qty: float, price: float) -> dict:
        order = await asyncio.wait_for(
            self.exchange.create_limit_buy_order(symbol, qty, price),
            timeout=EXCHANGE_TIMEOUT,
        )
        logger.info(f"[ORDER] Limit buy placed: {order}")
        return order

    async def place_market_sell(self, symbol: str, qty: float) -> dict:
        order = await asyncio.wait_for(
            self.exchange.create_market_sell_order(symbol, qty),
            timeout=EXCHANGE_TIMEOUT,
        )
        logger.info(f"[ORDER] Market sell placed: {order}")
        return order

    async def get_order(self, symbol: str, order_id: str) -> dict:
        return await asyncio.wait_for(
            self.exchange.fetch_order(order_id, symbol),
            timeout=EXCHANGE_TIMEOUT,
        )

    async def cancel_order(self, symbol: str, order_id: str) -> bool:
        try:
            await asyncio.wait_for(
                self.exchange.cancel_order(order_id, symbol),
                timeout=EXCHANGE_TIMEOUT,
            )
            return True
        except Exception as e:
            logger.error(f"Cancel order error: {e}")
            return False

    async def check_order_filled(self, symbol: str, order_id: str, timeout: int = 1800) -> Optional[float]:
        """Poll order status up to `timeout` seconds. Return filled_price if filled, else cancel and return None."""
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            try:
                order = await self.get_order(symbol, order_id)
                if order.get("status") == "closed" or order.get("filled", 0) >= order.get("amount", 1):
                    filled_price = order.get("average") or order.get("price")
                    return float(filled_price)
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error polling order {order_id}: {e}")
                await asyncio.sleep(2)
        await self.cancel_order(symbol, order_id)
        logger.warning(f"Order {order_id} not filled after {timeout}s — cancelled")
        return None

    async def get_min_order_amount(self, symbol: str) -> float:
        if symbol not in self._min_amounts:
            try:
                markets = await asyncio.wait_for(
                    self.exchange.load_markets(),
                    timeout=EXCHANGE_TIMEOUT,
                )
                market = markets.get(symbol, {})
                min_amount = market.get("limits", {}).get("amount", {}).get("min", 0.0)
                self._min_amounts[symbol] = float(min_amount or 0.0)
            except Exception as e:
                logger.error(f"Could not fetch min order amount: {e}")
                self._min_amounts[symbol] = 0.0
        return self._min_amounts[symbol]

    async def check_withdrawal_permission(self) -> bool:
        """Returns True if withdrawal is enabled on the API key (should always be False for safety)."""
        return False


# Alias for backward compatibility within the codebase
MexcExchange = BybitExchange
