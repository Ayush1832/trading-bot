import asyncio
import logging
from typing import Optional, Tuple
import ccxt.async_support as ccxt
import pandas as pd

logger = logging.getLogger(__name__)

EXCHANGE_TIMEOUT = 10  # seconds for all API calls


class MexcExchange:
    def __init__(self, api_key: str, api_secret: str, sandbox: bool = False):
        self.exchange = ccxt.mexc({
            "apiKey": api_key,
            "secret": api_secret,
            "enableRateLimit": True,
            "options": {
                "defaultType": "spot",
                "recvWindow": 20000,  # 20s window — tolerates laptop clock drift
            },
        })
        if sandbox:
            self.exchange.set_sandbox_mode(True)
        self._min_amounts: dict = {}
        self._min_costs: dict = {}

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
        balance = await asyncio.wait_for(
            self.exchange.fetch_balance(),
            timeout=EXCHANGE_TIMEOUT,
        )
        usdt = balance.get("USDT", {})
        return {
            "USDT": {
                "free": float(usdt.get("free") or 0),
                "used": float(usdt.get("used") or 0),
                "total": float(usdt.get("total") or 0),
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

    async def place_stop_loss(self, symbol: str, qty: float, trigger_price: float) -> dict:
        """
        MEXC's SPOT market does not support conditional/trigger orders via ccxt
        (only its derivatives markets do — see ccxt mexc.py 'features.spot',
        triggerPrice: False). There is no exchange-side resting stop-loss on
        spot, so this always raises. The caller (_place_exchange_stop in
        bot.py) already treats this as best-effort and falls back to the
        in-process ATR trailing stop, alerting that the bot must stay running.
        """
        raise NotImplementedError(
            "MEXC spot has no exchange-side stop-loss support — "
            "relying on the in-process trailing stop only"
        )

    async def get_order(self, symbol: str, order_id: str) -> dict:
        return await asyncio.wait_for(
            self.exchange.fetch_order(order_id, symbol),
            timeout=EXCHANGE_TIMEOUT,
        )

    async def get_order_status(self, symbol: str, order_id: str) -> Optional[dict]:
        """Best-effort order fetch. Returns None on error instead of raising,
        so monitor-loop reconciliation never crashes the loop."""
        try:
            return await self.get_order(symbol, order_id)
        except Exception as e:
            logger.warning(f"Could not fetch order {order_id} ({symbol}): {e}")
            return None

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

    async def check_order_filled(
        self, symbol: str, order_id: str, timeout: int = 120
    ) -> Optional[Tuple[float, float]]:
        """
        Poll order status up to `timeout` seconds. Returns (avg_fill_price, filled_qty)
        for ANY nonzero fill. Cancelling only cancels the unfilled remainder of an
        order, so a partial fill before timeout leaves a real position behind — that
        must be reported back (not treated as "no fill") so the caller can track/protect it.
        Returns None only when nothing filled at all.
        """
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while loop.time() < deadline:
            try:
                order = await self.get_order(symbol, order_id)
                filled = float(order.get("filled") or 0)
                if order.get("status") == "closed" or filled >= order.get("amount", 1):
                    filled_price = order.get("average") or order.get("price")
                    return (float(filled_price), filled)
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error polling order {order_id}: {e}")
                await asyncio.sleep(2)

        cancelled = await self.cancel_order(symbol, order_id)
        final = await self.get_order_status(symbol, order_id)
        filled_qty = float((final or {}).get("filled") or 0)
        if filled_qty > 0:
            fp = (final or {}).get("average") or (final or {}).get("price")
            if fp:
                logger.warning(
                    f"Order {order_id} partially filled ({filled_qty}) "
                    f"{'before cancel' if cancelled else '— cancel also failed'} — "
                    f"tracking the filled portion as an open position"
                )
                return (float(fp), filled_qty)
        if not cancelled:
            logger.error(f"Order {order_id} could not be cancelled and shows no confirmed fill — manual check advised")
        else:
            logger.warning(f"Order {order_id} not filled after {timeout}s — cancelled")
        return None

    async def get_min_order_amount(self, symbol: str) -> float:
        if symbol not in self._min_amounts:
            await self._load_min_limits(symbol)
        return self._min_amounts[symbol]

    async def get_min_order_cost(self, symbol: str) -> float:
        """
        Minimum order notional in quote currency (USDT). MEXC spot enforces a
        minimum COST (not just a minimum base quantity) — ccxt maps MEXC's
        quoteAmountPrecision into limits.cost.min. At a $1 trade cap this is
        the binding constraint, so it must be checked alongside min qty.
        """
        if symbol not in self._min_costs:
            await self._load_min_limits(symbol)
        return self._min_costs[symbol]

    async def _load_min_limits(self, symbol: str):
        try:
            markets = await asyncio.wait_for(
                self.exchange.load_markets(),
                timeout=EXCHANGE_TIMEOUT,
            )
            market = markets.get(symbol, {})
            limits = market.get("limits", {})
            self._min_amounts[symbol] = float(limits.get("amount", {}).get("min") or 0.0)
            self._min_costs[symbol] = float(limits.get("cost", {}).get("min") or 0.0)
        except Exception as e:
            logger.error(f"Could not fetch min order limits: {e}")
            self._min_amounts[symbol] = 0.0
            self._min_costs[symbol] = 0.0

    async def check_withdrawal_permission(self) -> bool:
        """Returns True if withdrawal is enabled on the API key (should always be False for safety)."""
        return False
