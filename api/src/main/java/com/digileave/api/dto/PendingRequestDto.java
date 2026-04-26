package com.digileave.api.dto;

import com.digileave.api.model.HalfDaySlot;
import com.digileave.api.model.LeaveStatus;
import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.LocalDate;

@Data
@AllArgsConstructor
public class PendingRequestDto {

    private String id;
    private String userId;
    private String userName;
    private String userEmail;
    private LocalDate startDate;
    private LocalDate endDate;
    private String type;
    /** Stored as double to support half-day requests (e.g. 2.5). */
    private double totalDays;
    private LocalDate requestDate;
    private LeaveStatus status;
    /** Which half of the last day is taken; NONE for full-day requests. */
    private HalfDaySlot halfDaySlot;
}
