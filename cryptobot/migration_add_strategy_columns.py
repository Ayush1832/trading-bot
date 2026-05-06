"""
Migration: add strategy snapshot columns to the trades table.

Run once after updating to v3:
    python migration_add_strategy_columns.py

Safe to run multiple times — existing columns are skipped without error.
"""
import sqlite3
import sys

DB_PATH = "cryptobot.db"

NEW_COLUMNS = [
    ("signal_score",        "INTEGER"),
    ("entry_rsi",           "REAL"),
    ("entry_ema20",         "REAL"),
    ("entry_ema50",         "REAL"),
    ("entry_adx",           "REAL"),
    ("entry_atr",           "REAL"),
    ("entry_volume_ratio",  "REAL"),
]

if __name__ == "__main__":
    try:
        conn = sqlite3.connect(DB_PATH)
    except Exception as e:
        print(f"ERROR: Cannot open database at {DB_PATH}: {e}")
        sys.exit(1)

    cursor = conn.cursor()

    for col_name, col_type in NEW_COLUMNS:
        try:
            cursor.execute(f"ALTER TABLE trades ADD COLUMN {col_name} {col_type}")
            print(f"  Added column: {col_name} {col_type}")
        except sqlite3.OperationalError as e:
            if "duplicate column" in str(e).lower():
                print(f"  Skipped (exists): {col_name}")
            else:
                print(f"  ERROR on {col_name}: {e}")

    conn.commit()

    # Verify
    print("\nFinal schema for 'trades' table:")
    cursor.execute("PRAGMA table_info(trades)")
    for row in cursor.fetchall():
        print(f"  {row[1]:30s} {row[2]}")

    conn.close()
    print("\nMigration complete.")
