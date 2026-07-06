package com.digileave.api.dto;

import jakarta.validation.constraints.DecimalMin;
import lombok.Data;

/**
 * Payload for PATCH /api/users/{id}/balance.
 * Allows an admin to set the current-year entitlement (informational only)
 * and/or the starting balance that leave requests are actually deducted
 * from, without touching the transferred field (which is managed
 * exclusively by the year-end rollover process).
 *
 * Both fields are boxed Doubles so missing/null JSON values are
 * defaulted to 0.0 in the controller rather than failing deserialization.
 */
@Data
public class BalanceAdjustmentDto {

    @DecimalMin("0.0")
    private Double entitled;

    private Double startingBalanceAdjustment;
}
