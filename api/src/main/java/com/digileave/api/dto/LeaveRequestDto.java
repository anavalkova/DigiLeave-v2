package com.digileave.api.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class LeaveRequestDto {

    private String userId;
    private LocalDate startDate;
    private LocalDate endDate;
    private String type;
}
