package com.digileave.api.dto;

import jakarta.validation.constraints.Min;
import lombok.Data;

/**
 * Payload for PATCH /api/users/{id}/balance.
 * Allows an admin to set the current-year entitlement and/or the
 * one-off accounting adjustment without touching the transferred field
 * (which is managed exclusively by the year-end rollover process).
 */
@Data
public class BalanceAdjustmentDto {

    @Min(0)
    private int entitled;

    private int startingBalanceAdjustment;
}
