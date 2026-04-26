package com.digileave.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

/**
 * Breakdown of a user's annual leave balance returned by GET /api/leave/summary/{userId}.
 *
 * available = entitled + transferred + startingBalanceAdjustment − used
 */
@Data
@AllArgsConstructor
public class LeaveSummaryDto {

    /** Days awarded for the current calendar year. */
    private int entitled;

    /** Unused days carried over from the previous year. */
    private int transferred;

    /**
     * Manual one-off accounting adjustment (positive = credit, negative = deduction).
     * Included so the frontend can show "includes ±N day adjustment" when non-zero.
     */
    private int startingBalanceAdjustment;

    /** Working days consumed by APPROVED annual-leave requests (supports 0.5 increments). */
    private double used;

    /** Working days in PENDING annual-leave requests (supports 0.5 increments). */
    private double pending;

    /** Derived: entitled + transferred + startingBalanceAdjustment − used (supports 0.5 increments). */
    private double available;
}
