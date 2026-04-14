package com.digileave.api.controller;

import com.digileave.api.dto.LeaveRequestDto;
import com.digileave.api.dto.LeaveSummaryDto;
import com.digileave.api.dto.PendingRequestDto;
import com.digileave.api.dto.StatusUpdateDto;
import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.service.LeaveService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/leave")
public class LeaveController {

    private final LeaveService leaveService;

    public LeaveController(LeaveService leaveService) {
        this.leaveService = leaveService;
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<List<LeaveRequest>> getRequestsByUser(@PathVariable String userId) {
        return ResponseEntity.ok(leaveService.getRequestsByUser(userId));
    }

    @GetMapping("/summary/{userId}")
    public ResponseEntity<LeaveSummaryDto> getSummary(@PathVariable String userId) {
        try {
            return ResponseEntity.ok(leaveService.getUserLeaveSummary(userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/pending")
    public ResponseEntity<List<PendingRequestDto>> getPendingRequests(@RequestParam String userId) {
        try {
            return ResponseEntity.ok(leaveService.getPendingRequests(userId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/request")
    public ResponseEntity<?> createRequest(@RequestBody LeaveRequestDto dto) {
        try {
            LeaveRequest saved = leaveService.createRequest(dto);
            return ResponseEntity.status(HttpStatus.CREATED).body(saved);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.unprocessableEntity().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PatchMapping("/{requestId}/cancel")
    public ResponseEntity<?> cancelRequest(
            @PathVariable String requestId,
            @RequestParam String userId) {
        try {
            LeaveRequest cancelled = leaveService.cancelRequest(requestId, userId);
            return ResponseEntity.ok(cancelled);
        } catch (ResponseStatusException e) {
            throw e; // let Spring return the correct 4xx status
        } catch (IllegalArgumentException e) {
            return ResponseEntity.unprocessableEntity().body(e.getMessage());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PatchMapping("/{requestId}/status")
    public ResponseEntity<LeaveRequest> updateRequestStatus(
            @PathVariable String requestId,
            @RequestBody StatusUpdateDto dto) {
        try {
            LeaveRequest updated;
            if (dto.getStatus() == LeaveStatus.APPROVED) {
                updated = leaveService.approveRequest(requestId);
            } else if (dto.getStatus() == LeaveStatus.REJECTED) {
                updated = leaveService.rejectRequest(requestId);
            } else {
                updated = leaveService.updateRequestStatus(requestId, dto.getStatus());
            }
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
