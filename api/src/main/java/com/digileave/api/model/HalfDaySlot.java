package com.digileave.api.model;

/**
 * Specifies which half of a working day a half-day leave request covers.
 *
 * NONE      – the request is a full-day (or multi-day) request; no half-day distinction.
 * MORNING   – only the morning slot (AM) is taken on the last date of the range.
 * AFTERNOON – only the afternoon slot (PM) is taken on the last date of the range.
 *
 * Slot-awareness allows a user to hold a MORNING request and an AFTERNOON request
 * on the same calendar date (e.g. paid leave AM + home-office PM) without triggering
 * the overlap guard.
 */
public enum HalfDaySlot {
    NONE,
    MORNING,
    AFTERNOON
}
