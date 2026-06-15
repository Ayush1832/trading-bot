"""Tests for the post-fill R:R abort guard (bot.should_abort_after_fill).

After a buy fills, the bot re-checks reward:risk against the ACTUAL fill price
and aborts the entry if it no longer clears config.min_rr_ratio.
"""

from backend.bot import should_abort_after_fill


# Planned setup: entry 100, SL 97 (risk 3), TP1 109 (reward 9) → R:R 3.0
SL = 97.0
TP1 = 109.0
MIN_RR = 3.0


def test_no_abort_when_fill_matches_plan():
    # Fill exactly at planned entry → R:R 3.0, which meets (not below) the floor.
    abort, rr = should_abort_after_fill(100.0, SL, TP1, MIN_RR)
    assert abort is False
    assert rr == 3.0


def test_abort_when_slippage_degrades_rr():
    # Fill at 101 → reward 8 / risk 4 = 2.0, below the 3.0 floor → abort.
    abort, rr = should_abort_after_fill(101.0, SL, TP1, MIN_RR)
    assert abort is True
    assert rr == 2.0


def test_no_abort_when_fill_still_clears_floor():
    # A small favourable fill keeps R:R above the floor.
    abort, rr = should_abort_after_fill(99.0, SL, TP1, MIN_RR)
    assert abort is False
    assert rr >= MIN_RR


def test_abort_on_invalid_levels():
    # Fill at/above the target → non-positive reward → R:R 0.0 → abort.
    abort, rr = should_abort_after_fill(109.0, SL, TP1, MIN_RR)
    assert abort is True
    assert rr == 0.0
