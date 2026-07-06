package com.digileave.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Breakdown of a user's annual leave balance returned by GET /api/leave/summary/{userId}.
 *
 * available = transferred + startingBalanceAdjustment − used
 */
@Data
@AllArgsConstructor
public class LeaveSummaryDto {

    /**
     * Days awarded for the current calendar year (supports half-day entitlements).
     * Informational only — shown to the user but excluded from {@code available}.
     */
    private double entitled;

    /** Unused days carried over from the previous year. */
    private int transferred;

    /**
     * The starting balance leave requests are deducted from (set by an admin,
     * e.g. from an HR export's "days left today").
     */
    private double startingBalanceAdjustment;

    /** Working days consumed by APPROVED annual-leave requests (supports 0.5 increments). */
    private double used;

    /** Working days in PENDING annual-leave requests (supports 0.5 increments). */
    private double pending;

    /** Derived: transferred + startingBalanceAdjustment − used (supports 0.5 increments). */
    private double available;
}
