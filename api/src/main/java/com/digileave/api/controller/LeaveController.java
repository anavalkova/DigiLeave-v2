package com.digileave.api.controller;

import com.digileave.api.dto.CalendarEventDto;
import com.digileave.api.dto.LeaveRequestDto;
import com.digileave.api.dto.LeaveRequestResponseDto;
import com.digileave.api.dto.LeaveSummaryDto;
import com.digileave.api.dto.PendingRequestDto;
import com.digileave.api.dto.StatusUpdateDto;
import com.digileave.api.mapper.DtoMapper;
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

@RestController
@RequestMapping("/api/leave")
public class LeaveController {

    private final LeaveService leaveService;
    private final DtoMapper    mapper;

    public LeaveController(LeaveService leaveService, DtoMapper mapper) {
        this.leaveService = leaveService;
        this.mapper       = mapper;
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<LeaveRequestResponseDto>> getRequestsByUser(
            @PathVariable String userId,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate requestDateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate requestDateTo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDateTo) {
        return ResponseEntity.ok(
                leaveService.getRequestsByUser(userId, type, status, requestDateFrom, requestDateTo, startDateFrom, startDateTo)
                        .stream().map(mapper::toLeaveRequestResponse).toList());
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
    public ResponseEntity<LeaveRequestResponseDto> createRequest(@Valid @RequestBody LeaveRequestDto dto) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(mapper.toLeaveRequestResponse(leaveService.createRequest(dto)));
    }

    @PatchMapping("/{requestId}/cancel")
    public ResponseEntity<LeaveRequestResponseDto> cancelRequest(
            @PathVariable String requestId,
            @RequestParam String userId) {
        return ResponseEntity.ok(mapper.toLeaveRequestResponse(leaveService.cancelRequest(requestId, userId)));
    }

    @PatchMapping("/{requestId}/status")
    public ResponseEntity<LeaveRequestResponseDto> updateRequestStatus(
            @PathVariable String requestId,
            @RequestBody StatusUpdateDto dto) {
        return ResponseEntity.ok(mapper.toLeaveRequestResponse(
                leaveService.processStatusUpdate(requestId, dto.getStatus(), dto.getRejectionReason())));
    }
}
