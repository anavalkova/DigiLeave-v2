package com.digileave.api.model;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Ledger-based annual leave balance embedded in the User document.
 *
 * Available = transferred + startingBalanceAdjustment − used
 *
 * {@code entitled} is informational only (e.g. "23 days for 2026" from an
 * HR export) — it is shown to the user but does NOT feed into the available
 * balance. {@code startingBalanceAdjustment} ("Starting Balance") is the
 * actual quota that leave requests are deducted from.
 *
 * Deduction priority on approval: transferred days are consumed first
 * because they are subject to expiration under Art. 176 of the Bulgarian
 * Labour Code (unused leave generally expires after two years from the end
 * of the year in which it should have been taken).
 *
 * {@code used}, {@code entitled}, and {@code startingBalanceAdjustment} are stored
 * as doubles to support half-day units. {@code transferred} remains an integer.
 */
@Data
@NoArgsConstructor
public class AnnualLeaveBalance {

    /**
     * Days awarded for the current calendar year (e.g. 20), shown for reference.
     * Informational only — does not affect {@link #available()}.
     */
    private double entitled = 0;

    /**
     * Unused days carried over from the previous year via the year-end rollover.
     * Tracked separately so they can be expired at a future date per Art. 176.
     */
    private int transferred = 0;

    /**
     * The starting balance leave requests are actually deducted from —
     * set by an admin (e.g. from an HR export's "days left today").
     * Stored as double to support half-day adjustments.
     */
    private double startingBalanceAdjustment = 0;

    /**
     * Total working days consumed by APPROVED annual-leave requests.
     * Stored as double to support half-day entries (e.g. 2.5).
     * Updated by the service layer on every approval, rejection-of-prior-approval,
     * or cancellation — never trusted for display; always recomputed from the ledger.
     */
    private double used = 0.0;

    /**
     * Derived — never persisted; always re-computed.
     * Returns: transferred + startingBalanceAdjustment − used
     */
    public double available() {
        return transferred + startingBalanceAdjustment - used;
    }
}
