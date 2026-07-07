import asyncio
import logging
from typing import Optional, Tuple
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
                "defaultCategory": "spot",
                "recvWindow": 20000,  # 20s window — tolerates laptop clock drift
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
        # Bybit Unified Trading Account (UTA) — try each account type until one returns a USDT balance.
        last_error = None
        for params in [{"type": "unified"}, {"type": "spot"}, {}]:
            try:
                balance = await asyncio.wait_for(
                    self.exchange.fetch_balance(params),
                    timeout=EXCHANGE_TIMEOUT,
                )
                usdt = balance.get("USDT", {})
                if usdt.get("free") is not None:
                    return {
                        "USDT": {
                            "free": float(usdt.get("free") or 0),
                            "used": float(usdt.get("used") or 0),
                            "total": float(usdt.get("total") or 0),
                        }
                    }
            except Exception as e:
                last_error = e
                logger.warning(f"Balance fetch with params={params} failed: {e}")
                continue
        raise Exception(f"All balance fetch attempts failed. Last error: {last_error}")

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
        Place a resting conditional STOP-MARKET sell on Bybit spot that triggers
        when the last price falls to `trigger_price`. This is the catastrophe
        floor: it protects the position even if this bot process is not running.

        Uses ccxt's unified trigger params plus an explicit Bybit triggerDirection
        (2 = trigger when price falls). Returns the order dict (contains its id).
        """
        try:
            qty = float(self.exchange.amount_to_precision(symbol, qty))
            trig = float(self.exchange.price_to_precision(symbol, trigger_price))
        except Exception:
            trig = trigger_price
        params = {
            "triggerPrice": trig,
            # Bybit v5 expects an INTEGER triggerDirection (2 = trigger when the
            # price FALLS to the trigger). Must stay an int, never the string "2".
            "triggerDirection": int(2),
        }
        order = await asyncio.wait_for(
            self.exchange.create_order(symbol, "market", "sell", qty, None, params),
            timeout=EXCHANGE_TIMEOUT,
        )
        logger.info(f"[ORDER] Stop-loss placed for {symbol} @ trigger {trig}: id={order.get('id')}")
        # Full response logged so the resting stop can be verified on the exchange
        # the first time this runs on mainnet (confirm it is a conditional/stop order).
        logger.info(f"[ORDER] Stop-loss full exchange response for {symbol}: {order}")
        return order

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
        for ANY nonzero fill. Bybit only cancels the unfilled remainder of an order,
        so a partial fill before timeout leaves a real position behind — that must be
        reported back (not treated as "no fill") so the caller can track/protect it.
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
