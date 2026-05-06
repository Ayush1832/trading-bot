import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


class TelegramNotifier:
    def __init__(self, token: str, chat_id: str):
        self.token = token
        self.chat_id = chat_id
        self._bot = None
        if token and chat_id:
            try:
                from telegram import Bot
                self._bot = Bot(token=token)
            except Exception as e:
                logger.error(f"Failed to init Telegram bot: {e}")

    async def _send(self, text: str):
        if not self._bot or not self.chat_id:
            logger.info(f"[TELEGRAM-DISABLED] {text[:80]}")
            return
        try:
            await self._bot.send_message(
                chat_id=self.chat_id,
                text=text,
                parse_mode="HTML",
            )
        except Exception as e:
            logger.error(f"Telegram send error: {e}")

    async def send_trade_opened(self, trade: dict, signal_vals: dict = None):
        vals = signal_vals or {}
        grade = vals.get("grade") or trade.get("grade") or "B"
        rr = vals.get("rr_ratio") or trade.get("rr_ratio") or 0.0
        fib = vals.get("fib_zone") or trade.get("entry_nearest_fib") or "N/A"
        div_str = vals.get("divergence_strength")
        rsi_low = vals.get("rsi_at_low")
        atr_1h = vals.get("atr_1h") or trade.get("entry_1h_atr")
        macd = "Yes" if vals.get("macd_cross") else "No"
        weak = "Yes" if vals.get("weak_sellers") else "No"

        entry = trade.get("entry_price", 0)
        tp1 = trade.get("take_profit_price", 0)
        tp2 = trade.get("tp2_price", 0)
        sl = trade.get("hard_sl_price", 0)

        msg = (
            f"🟢 <b>SWING TRADE OPENED — Grade {grade}</b>\n"
            "──────────────────────────\n"
            f"Pair:       {trade.get('symbol')}\n"
            f"Entry:      ${entry:,.4f}\n"
            f"Qty:        {trade.get('qty', 0):.6f}\n"
            f"Hard SL:    ${sl:,.4f}\n"
            f"TP1 (50%%): ${tp1:,.4f}\n"
            f"TP2 (run):  ${tp2:,.4f}\n"
            f"R:R:        {rr:.1f}:1\n"
            "──────────────────────────\n"
            f"[W] Weekly EMA200:   ✓\n"
            f"[D] Fib zone:        {fib}\n"
            f"[4] RSI divergence:  {f'+{div_str:.1f}' if div_str else 'Yes'} (RSI low {f'{rsi_low:.1f}' if rsi_low else 'N/A'})\n"
            f"[4] MACD cross:      {macd}  |  Weak sellers: {weak}\n"
            f"[1] Break of Struct: ✓\n"
            f"ATR(1H):    {f'${atr_1h:,.4f}' if atr_1h else 'N/A'}\n"
            f"Time:       {datetime.now(timezone.utc).strftime('%H:%M UTC %Y-%m-%d')}"
        )
        await self._send(msg)

    async def send_tp1_partial(self, trade: dict, tp1_price: float, tp1_pnl_usdt: float, qty_remaining: float):
        entry = trade.get("entry_price", 0)
        symbol = trade.get("symbol", "")
        tp1_pct = ((tp1_price - entry) / entry * 100) if entry > 0 else 0.0
        tp2 = trade.get("tp2_price", 0)

        msg = (
            "🎯 <b>TP1 HIT — PARTIAL EXIT (50%%)</b>\n"
            "──────────────────────────\n"
            f"Pair:        {symbol}\n"
            f"Entry:       ${entry:,.4f}\n"
            f"TP1 fill:    ${tp1_price:,.4f} (+{tp1_pct:.2f}%%)\n"
            f"TP1 P&amp;L:    {tp1_pnl_usdt:+.4f} USDT\n"
            f"──────────────────────────\n"
            f"Remaining:   {qty_remaining:.6f} (50%% of position)\n"
            f"SL moved to: BREAKEVEN (entry price)\n"
            f"TP2 target:  ${tp2:,.4f}\n"
            f"Running with ATR trailing stop."
        )
        await self._send(msg)

    async def send_tsl_updated(self, trade: dict, old_tsl: float, new_tsl: float):
        peak = trade.get("peak_price", 0)
        entry = trade.get("entry_price", 1)
        locked_pct = ((new_tsl / entry) - 1) * 100
        msg = (
            "📈 <b>TRAILING STOP RAISED</b>\n"
            "──────────────────────\n"
            f"Pair:      {trade.get('symbol')}\n"
            f"New high:  ${peak:,.4f}\n"
            f"New TSL:   ${new_tsl:,.4f} (was ${old_tsl:,.4f})\n"
            f"Locked in: {locked_pct:+.2f}%"
        )
        await self._send(msg)

    async def send_trade_closed(self, trade: dict):
        tp1_pnl = trade.get("tp1_pnl_usdt") or 0.0
        final_pnl = trade.get("pnl_usdt") or 0.0
        total_pnl = trade.get("total_pnl_usdt") or (tp1_pnl + final_pnl)
        total_pct = trade.get("total_pnl_pct") or trade.get("pnl_pct") or 0.0
        outcome = "WIN ✅" if total_pnl >= 0 else "LOSS ❌"
        reason = trade.get("exit_reason", "N/A")

        entry = trade.get("entry_time")
        exit_t = trade.get("exit_time")
        hold_str = ""
        if entry and exit_t:
            if isinstance(entry, str):
                entry = datetime.fromisoformat(entry)
            if isinstance(exit_t, str):
                exit_t = datetime.fromisoformat(exit_t)
            delta = (exit_t - entry).total_seconds()
            hours = int(delta // 3600)
            mins = int((delta % 3600) // 60)
            hold_str = f"{hours}h {mins}m"

        half = trade.get("half_exited", False)
        tp1_line = f"TP1 partial: {tp1_pnl:+.4f} USDT\n" if half else ""
        final_label = "TP2 / final" if half else "Trade"

        msg = (
            f"🔴 <b>SWING TRADE CLOSED — {outcome}</b>\n"
            "──────────────────────────\n"
            f"Pair:       {trade.get('symbol')}\n"
            f"Entry:      ${trade.get('entry_price', 0):,.4f}\n"
            f"Exit:       ${trade.get('exit_price', 0):,.4f}\n"
            f"Reason:     {reason}\n"
            f"Grade:      {trade.get('grade', 'N/A')}\n"
            f"──────────────────────────\n"
            f"{tp1_line}"
            f"{final_label} P&amp;L: {final_pnl:+.4f} USDT\n"
            f"Total P&amp;L: {total_pnl:+.4f} USDT ({total_pct:+.2f}%)\n"
            f"Hold time:  {hold_str}"
        )
        await self._send(msg)

    async def send_daily_summary(self, stats: dict, trades_today: int = 0, max_trades: int = 1,
                                  exit_breakdown: dict = None, daily_halted: bool = False):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        total = stats.get("total_trades", 0)
        wins = stats.get("winning_trades", 0)
        losses = stats.get("losing_trades", 0)
        pnl = stats.get("pnl_usdt", 0)
        win_rate = (wins / total * 100) if total > 0 else 0

        breakdown = exit_breakdown or {}
        tp1_c = breakdown.get("TP1_PARTIAL", 0)
        tp2_c = breakdown.get("TAKE_PROFIT_2", 0)
        tsl_c = breakdown.get("TRAILING_SL", 0)
        sl_c = breakdown.get("HARD_SL", 0)
        be_c = breakdown.get("BREAKEVEN_SL", 0)
        to_c = breakdown.get("TIMEOUT", 0)

        halt_str = "⛔ YES — daily drawdown limit hit" if daily_halted else "No"

        msg = (
            f"📊 <b>DAILY SUMMARY — {today}</b>\n"
            "──────────────────────────────\n"
            f"Trades:     {trades_today} / {max_trades}\n"
            f"Wins:       {wins} ({win_rate:.1f}%)\n"
            f"Losses:     {losses}\n"
            f"Total P&amp;L:  {pnl:+.4f} USDT\n"
            f"Best trade: {stats.get('best_trade_pct', 0):+.2f}%\n"
            f"Worst:      {stats.get('worst_trade_pct', 0):+.2f}%\n"
            f"Avg hold:   {stats.get('avg_hold_minutes', 0):.0f} min\n"
            f"Exits:  TP1:{tp1_c} TP2:{tp2_c} TSL:{tsl_c} SL:{sl_c} BE:{be_c} TO:{to_c}\n"
            f"Daily halt: {halt_str}\n"
            f"Balance:    ${stats.get('ending_balance', 0):.4f}"
        )
        await self._send(msg)

    async def send_error(self, error_msg: str):
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
        msg = f"⚠️ <b>BOT ERROR</b>\n──────────\n{error_msg}\nTime: {ts}"
        await self._send(msg)

    async def send_bot_started(self, config=None):
        syms = ", ".join(getattr(config, "symbols", ["BTC/USDT"])) if config else "BTC/USDT"
        interval = getattr(config, "scan_interval_seconds", 900) if config else 900
        min_rr = getattr(config, "min_rr_ratio", 3.0) if config else 3.0
        msg = (
            f"🤖 <b>CryptoBot Pro — Swing Mode</b>\n"
            f"Watching: {syms}\n"
            f"Timeframes: 1W / 1D / 4H / 1H\n"
            f"Scan every {interval // 60} min | Min R:R {min_rr:.1f}:1 | Max 1 trade/day"
        )
        await self._send(msg)

    async def send_bot_stopped(self, reason: str):
        await self._send(f"🛑 CryptoBot Pro stopped. Reason: {reason}")

    async def send_test_message(self):
        await self._send("✅ Telegram connection working. CryptoBot Pro (Swing) is connected.")
