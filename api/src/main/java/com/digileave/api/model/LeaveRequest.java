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

    /**
     * Total working days this request covers.
     * Stored as a double to support half-day requests (e.g. 2.5 days).
     */
    private double totalDays;

    /**
     * True when the last date of the range is a half-day.
     * Derived from halfDaySlot: true iff slot is MORNING or AFTERNOON.
     * Kept for backward compatibility with records written before slot support.
     */
    private boolean halfDay;

    /**
     * Which half of the last day this request occupies.
     * NONE means the request covers full days throughout.
     * MORNING / AFTERNOON allow two complementary half-day requests to coexist on the same date.
     */
    private HalfDaySlot halfDaySlot;

    private LocalDate requestDate;
    /** Copied from User.approverEmails at submission time so the routing is immutable. */
    private List<String> approverEmails;
}
