"""
Migration: add swing-strategy columns to the trades table.
Safe to run multiple times — existing columns are skipped.

Usage:
    cd cryptobot
    python migration_swing_columns.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "cryptobot.db")

NEW_COLUMNS = [
    # Swing entry snapshot
    ("rr_ratio", "REAL"),
    ("grade", "TEXT"),
    ("entry_divergence_strength", "REAL"),
    ("entry_nearest_fib", "TEXT"),
    ("entry_1h_atr", "REAL"),
    # Split exit tracking
    ("half_exited", "INTEGER DEFAULT 0"),
    ("tp1_exit_price", "REAL"),
    ("tp1_exit_time", "TEXT"),
    ("tp1_pnl_usdt", "REAL"),
    ("tp1_order_id", "TEXT"),
    ("tp2_order_id", "TEXT"),
    ("breakeven_sl", "REAL"),
    ("total_pnl_usdt", "REAL"),
    ("total_pnl_pct", "REAL"),
    # TP2 column (second take-profit level)
    ("tp2_price", "REAL"),
    # Allow hard_sl_price to be NULL (was NOT NULL in old schema)
    # Note: SQLite cannot alter column constraints — existing data is unaffected
]


def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH} — nothing to migrate (will be created fresh).")
        return

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Get existing columns
    cur.execute("PRAGMA table_info(trades)")
    existing = {row[1] for row in cur.fetchall()}

    added = []
    skipped = []

    for col_name, col_type in NEW_COLUMNS:
        if col_name in existing:
            skipped.append(col_name)
            continue
        try:
            cur.execute(f"ALTER TABLE trades ADD COLUMN {col_name} {col_type}")
            added.append(col_name)
        except sqlite3.OperationalError as e:
            print(f"  WARN: {col_name} — {e}")

    conn.commit()
    conn.close()

    print(f"Migration complete.")
    print(f"  Added   ({len(added)}): {', '.join(added) if added else 'none'}")
    print(f"  Skipped ({len(skipped)}): {', '.join(skipped) if skipped else 'none'}")


if __name__ == "__main__":
    migrate()
