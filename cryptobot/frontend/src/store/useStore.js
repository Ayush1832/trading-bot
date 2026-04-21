import { create } from 'zustand'

const useStore = create((set) => ({
  botState: {
    running: false,
    trade_open: false,
    entry_price: null,
    current_price: null,
    trailing_sl: null,
    take_profit_price: null,
    unrealized_pnl_pct: null,
    peak_price: null,
    last_rsi: null,
    last_ema50: null,
    last_bb_low: null,
    last_bb_high: null,
    last_volume_ratio: null,
    session_trades: 0,
    session_wins: 0,
    session_pnl_usdt: 0,
  },
  logs: [],
  candles: [],
  indicators: {},
  tslPulse: false,

  setBotState: (data) => set({ botState: data }),

  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs.slice(-199), log],
    })),

  setCandles: (candles, indicators) => set({ candles, indicators }),

  setTslPulse: (v) => set({ tslPulse: v }),
}))

export default useStore
