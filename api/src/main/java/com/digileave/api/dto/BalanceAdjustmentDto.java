package com.digileave.api.dto;

import lombok.Data;

/**
 * Payload for PATCH /api/users/{id}/balance.
 * Allows an admin to set the current-year entitlement and/or the
 * one-off accounting adjustment without touching the transferred field
 * (which is managed exclusively by the year-end rollover process).
 */
@Data
public class BalanceAdjustmentDto {
    private int entitled;
    private int startingBalanceAdjustment;
}
