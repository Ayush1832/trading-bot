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

    async def send_trade_opened(self, trade: dict):
        msg = (
            "🟢 <b>TRADE OPENED</b>\n"
            "──────────────\n"
            f"Pair:    {trade.get('symbol')}\n"
            f"Entry:   ${trade.get('entry_price', 0):,.2f}\n"
            f"Qty:     {trade.get('qty', 0):.8f}\n"
            f"TP:      ${trade.get('take_profit_price', 0):,.2f} (+{trade.get('trail_pct', 0.012)*100:.1f}%)\n"
            f"Hard SL: ${trade.get('hard_sl_price', 0):,.2f} (-{trade.get('trail_pct', 0.008)*100:.1f}%)\n"
            f"TSL:     ${trade.get('hard_sl_price', 0):,.2f} (trailing {trade.get('trail_pct', 0.008)*100:.1f}%)\n"
            f"Time:    {datetime.now(timezone.utc).strftime('%H:%M:%S')} UTC"
        )
        await self._send(msg)

    async def send_tsl_updated(self, trade: dict, old_tsl: float, new_tsl: float):
        peak = trade.get("peak_price", 0)
        locked_pct = ((new_tsl / trade.get("entry_price", 1)) - 1) * 100
        msg = (
            "📈 <b>TRAILING STOP UPDATED</b>\n"
            "──────────────────────\n"
            f"Pair:      {trade.get('symbol')}\n"
            f"New high:  ${peak:,.2f}\n"
            f"New TSL:   ${new_tsl:,.2f} (was ${old_tsl:,.2f})\n"
            f"Locked in: {locked_pct:+.2f}% profit"
        )
        await self._send(msg)

    async def send_trade_closed(self, trade: dict):
        pnl = trade.get("pnl_usdt", 0) or 0
        pnl_pct = trade.get("pnl_pct", 0) or 0
        outcome = "WIN ✅" if pnl >= 0 else "LOSS ❌"
        entry = trade.get("entry_time")
        exit_t = trade.get("exit_time")
        hold_str = ""
        if entry and exit_t:
            if isinstance(entry, str):
                entry = datetime.fromisoformat(entry)
            if isinstance(exit_t, str):
                exit_t = datetime.fromisoformat(exit_t)
            delta = (exit_t - entry).total_seconds()
            mins = int(delta // 60)
            secs = int(delta % 60)
            hold_str = f"{mins} min {secs} sec"
        msg = (
            f"🔴 <b>TRADE CLOSED — {outcome}</b>\n"
            "──────────────────────────\n"
            f"Pair:      {trade.get('symbol')}\n"
            f"Entry:     ${trade.get('entry_price', 0):,.2f}\n"
            f"Exit:      ${trade.get('exit_price', 0):,.2f}\n"
            f"Peak:      ${trade.get('peak_price', 0):,.2f}\n"
            f"Reason:    {trade.get('exit_reason', 'N/A')}\n"
            f"P&amp;L:       {pnl:+.4f} USDT ({pnl_pct:+.2f}%)\n"
            f"Hold time: {hold_str}"
        )
        await self._send(msg)

    async def send_daily_summary(self, stats: dict):
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        total = stats.get("total_trades", 0)
        wins = stats.get("winning_trades", 0)
        losses = stats.get("losing_trades", 0)
        pnl = stats.get("pnl_usdt", 0)
        win_rate = (wins / total * 100) if total > 0 else 0
        msg = (
            f"📊 <b>DAILY SUMMARY — {today}</b>\n"
            "──────────────────────────────\n"
            f"Trades today:  {total}\n"
            f"Wins:          {wins} ({win_rate:.1f}%)\n"
            f"Losses:        {losses} ({100 - win_rate:.1f}%)\n"
            f"Total P&amp;L:     {pnl:+.4f} USDT\n"
            f"Best trade:    {stats.get('best_trade_pct', 0):+.2f}%\n"
            f"Worst trade:   {stats.get('worst_trade_pct', 0):+.2f}%\n"
            f"Avg hold:      {stats.get('avg_hold_minutes', 0):.1f} min\n"
            f"Balance EOD:   ${stats.get('ending_balance', 0):.4f}"
        )
        await self._send(msg)

    async def send_error(self, error_msg: str):
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
        msg = f"⚠️ <b>BOT ERROR</b>\n──────────\n{error_msg}\nTime: {ts}"
        await self._send(msg)

    async def send_bot_started(self):
        await self._send("🤖 CryptoBot Pro started. Scanning BTC/USDT on 1m...")

    async def send_bot_stopped(self, reason: str):
        await self._send(f"🛑 CryptoBot Pro stopped. Reason: {reason}")

    async def send_test_message(self):
        await self._send("✅ Telegram connection working. CryptoBot Pro is connected.")
