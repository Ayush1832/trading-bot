import { create } from 'zustand'

const useStore = create((set) => ({
  botState: {
    running: false,
    dry_run: false,
    trade_open: false,
    trade_opened_today: false,
    current_symbol: null,
    entry_price: null,
    current_price: null,
    unrealized_pnl_pct: null,
    peak_price: null,
    // Swing exit levels
    trailing_sl: null,
    sl_price: null,
    tp1_price: null,
    tp2_price: null,
    atr_1h: null,
    rr_ratio: null,
    grade: null,
    // Split exit state
    qty_total: null,
    qty_remaining: null,
    half_exited: false,
    tp1_exit_price: null,
    tp1_pnl_usdt: null,
    // Balance
    usdt_balance: 0,
    // Session stats
    session_trades: 0,
    session_wins: 0,
    session_pnl_usdt: 0,
    // Daily counters
    trades_today: 0,
    wins_today: 0,
    losses_today: 0,
    pnl_today_usdt: 0,
    signals_today: 0,
    daily_halted: false,
    // Scanner
    scanner: {},
  },
  logs: [],
  candles: [],
  indicators: {},
  scanner: {},

  tslPulse: false,

  setBotState: (data) =>
    set({
      botState: data,
      scanner: data.scanner || {},
    }),

  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs.slice(-199), log],
    })),

  setCandles: (candles, indicators) => set({ candles, indicators }),

  setScanner: (data) => set({ scanner: data }),

  setTslPulse: (value) => set({ tslPulse: value }),
}))

export default useStore
