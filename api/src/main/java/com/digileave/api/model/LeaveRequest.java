package com.digileave.api.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDate;
import java.util.List;

@Data
@Document(collection = "leave_requests")
public class LeaveRequest {

    @Id
    private String id;

    private String userId;
    private LocalDate startDate;
    private LocalDate endDate;
    private String type;
    private LeaveStatus status;
    private int totalDays;
    private LocalDate requestDate;
    /** Copied from User.approverEmails at submission time so the routing is immutable. */
    private List<String> approverEmails;
}
