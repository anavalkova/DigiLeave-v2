package com.digileave.api.dto;

import com.digileave.api.model.HalfDaySlot;

import java.time.LocalDate;

/**
 * Projection returned by GET /api/leave/calendar.
 * end is inclusive.
 */
public class CalendarEventDto {

    private String      id;
    private String      userId;
    private String      userName;
    private String      userEmail;
    private LocalDate   start;
    private LocalDate   end;          // inclusive
    private String      type;         // e.g. "annual", "home_office"
    private String      status;       // "APPROVED" | "PENDING"
    private HalfDaySlot halfDaySlot;  // NONE | MORNING | AFTERNOON — applies to the last day only

    public CalendarEventDto(String id, String userId, String userName, String userEmail,
                            LocalDate start, LocalDate end,
                            String type, String status, HalfDaySlot halfDaySlot) {
        this.id          = id;
        this.userId      = userId;
        this.userName    = userName;
        this.userEmail   = userEmail;
        this.start       = start;
        this.end         = end;
        this.type        = type;
        this.status      = status;
        this.halfDaySlot = halfDaySlot != null ? halfDaySlot : HalfDaySlot.NONE;
    }

    public String      getId()          { return id; }
    public String      getUserId()      { return userId; }
    public String      getUserName()    { return userName; }
    public String      getUserEmail()   { return userEmail; }
    public LocalDate   getStart()       { return start; }
    public LocalDate   getEnd()         { return end; }
    public String      getType()        { return type; }
    public String      getStatus()      { return status; }
    public HalfDaySlot getHalfDaySlot() { return halfDaySlot; }
}
