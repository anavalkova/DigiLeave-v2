package com.digileave.api.model;

import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Ledger-based annual leave balance embedded in the User document.
 *
 * Available = entitled + transferred + startingBalanceAdjustment − used
 *
 * Deduction priority on approval: transferred days are consumed first
 * because they are subject to expiration under Art. 176 of the Bulgarian
 * Labour Code (unused leave generally expires after two years from the end
 * of the year in which it should have been taken).
 *
 * {@code used} is stored as a double to support half-day requests.
 * {@code entitled}, {@code transferred}, and {@code startingBalanceAdjustment}
 * remain integers — they are always set in whole-day units by admins.
 */
@Data
@NoArgsConstructor
public class AnnualLeaveBalance {

    /** Days awarded for the current calendar year (e.g. 20). */
    private int entitled = 0;

    /**
     * Unused days carried over from the previous year via the year-end rollover.
     * Tracked separately so they can be expired at a future date per Art. 176.
     */
    private int transferred = 0;

    /**
     * One-off manual adjustment to synchronise with external accounting records.
     * Positive = credit (accounting owes more days), negative = deduction.
     */
    private int startingBalanceAdjustment = 0;

    /**
     * Total working days consumed by APPROVED annual-leave requests.
     * Stored as double to support half-day entries (e.g. 2.5).
     * Updated by the service layer on every approval, rejection-of-prior-approval,
     * or cancellation — never trusted for display; always recomputed from the ledger.
     */
    private double used = 0.0;

    /**
     * Derived — never persisted; always re-computed.
     * Returns: entitled + transferred + startingBalanceAdjustment − used
     */
    public double available() {
        return entitled + transferred + startingBalanceAdjustment - used;
    }
}
