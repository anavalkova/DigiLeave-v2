package com.digileave.api.dto;

import lombok.Data;

import java.time.LocalDate;
import java.util.List;

@Data
public class LeaveRequestResponseDto {

    private String       id;
    private String       userId;
    private LocalDate    startDate;
    private LocalDate    endDate;
    private String       type;
    private String       status;
    private double       totalDays;
    private boolean      halfDay;
    private String       halfDaySlot;
    private LocalDate    requestDate;
    private List<String> approverEmails;
    private String       rejectionReason;
}
