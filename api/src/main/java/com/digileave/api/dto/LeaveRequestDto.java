package com.digileave.api.dto;

import com.digileave.api.model.HalfDaySlot;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class LeaveRequestDto {

    @NotBlank
    private String userId;

    @NotNull
    private LocalDate startDate;

    @NotNull
    private LocalDate endDate;

    @NotBlank
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
