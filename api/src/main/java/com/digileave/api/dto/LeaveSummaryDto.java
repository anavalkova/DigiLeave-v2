package com.digileave.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LeaveSummaryDto {

    private int entitledDays;
    private int usedDays;
    private int pendingDays;
    private int remainingDays;
    private int rejectedDays;
}
