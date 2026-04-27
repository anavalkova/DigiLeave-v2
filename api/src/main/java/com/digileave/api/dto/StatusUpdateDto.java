package com.digileave.api.dto;

import com.digileave.api.model.LeaveStatus;
import lombok.Data;

@Data
public class StatusUpdateDto {

    private LeaveStatus status;
    private String      rejectionReason;
}
