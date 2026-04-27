package com.digileave.api.controller;

import com.digileave.api.dto.CalendarEventDto;
import com.digileave.api.dto.LeaveRequestDto;
import com.digileave.api.dto.LeaveSummaryDto;
import com.digileave.api.dto.PendingRequestDto;
import com.digileave.api.dto.StatusUpdateDto;
import com.digileave.api.model.LeaveRequest;
import com.digileave.api.service.LeaveService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/**
 * REST controller for leave request operations.
 * All exception handling is delegated to {@link com.digileave.api.exception.GlobalExceptionHandler}.
 */
@RestController
@RequestMapping("/api/leave")
public class LeaveController {

    private final LeaveService leaveService;

    public LeaveController(LeaveService leaveService) {
        this.leaveService = leaveService;
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<LeaveRequest>> getRequestsByUser(
            @PathVariable String userId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate requestDateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate requestDateTo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDateTo) {
        return ResponseEntity.ok(leaveService.getRequestsByUser(
                userId, type, status, requestDateFrom, requestDateTo, startDateFrom, startDateTo));
    }

    @GetMapping("/summary/{userId}")
    public ResponseEntity<LeaveSummaryDto> getSummary(@PathVariable String userId) {
        return ResponseEntity.ok(leaveService.getUserLeaveSummary(userId));
    }

    @GetMapping("/calendar")
    public ResponseEntity<List<CalendarEventDto>> getCalendarEvents(
            @RequestParam String viewerId,
            @RequestParam int year,
            @RequestParam int month,
            @RequestParam(required = false) String team) {
        return ResponseEntity.ok(leaveService.getCalendarEvents(viewerId, year, month, team));
    }

    @GetMapping("/pending")
    public ResponseEntity<List<PendingRequestDto>> getPendingRequests(
            @RequestParam String userId,
            @RequestParam(required = false) String team,
            @RequestParam(required = false) String employeeName,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate requestDateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate requestDateTo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDateTo) {
        return ResponseEntity.ok(leaveService.getPendingRequests(
                userId, team, employeeName, type, status,
                requestDateFrom, requestDateTo, startDateFrom, startDateTo));
    }

    @PostMapping("/request")
    public ResponseEntity<LeaveRequest> createRequest(@Valid @RequestBody LeaveRequestDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(leaveService.createRequest(dto));
    }

    @PatchMapping("/{requestId}/cancel")
    public ResponseEntity<LeaveRequest> cancelRequest(
            @PathVariable String requestId,
            @RequestParam String userId) {
        return ResponseEntity.ok(leaveService.cancelRequest(requestId, userId));
    }

    @PatchMapping("/{requestId}/status")
    public ResponseEntity<LeaveRequest> updateRequestStatus(
            @PathVariable String requestId,
            @RequestBody StatusUpdateDto dto) {
        return ResponseEntity.ok(leaveService.processStatusUpdate(requestId, dto.getStatus(), dto.getRejectionReason()));
    }
}
