package com.digileave.api.dto;

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
    private int totalDays;
    private LocalDate requestDate;
    private LeaveStatus status;
}
