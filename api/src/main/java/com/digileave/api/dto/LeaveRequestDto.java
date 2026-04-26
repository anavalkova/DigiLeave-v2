package com.digileave.api.dto;

import com.digileave.api.model.HalfDaySlot;
import lombok.Data;

import java.time.LocalDate;

@Data
public class LeaveRequestDto {

    private String userId;
    private LocalDate startDate;
    private LocalDate endDate;
    private String type;

    /**
     * Which half of the last working day this request occupies.
     * Null or NONE → full-day request.
     * MORNING / AFTERNOON → 0.5-day deducted from the last date only.
     */
    private HalfDaySlot halfDaySlot;

    /** Derived convenience accessor used by service logic. */
    public boolean isHalfDay() {
        return halfDaySlot != null && halfDaySlot != HalfDaySlot.NONE;
    }
}
