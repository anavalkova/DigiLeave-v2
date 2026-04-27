package com.digileave.api.controller;

import com.digileave.api.dto.BalanceAdjustmentDto;
import com.digileave.api.dto.UserApproverUpdateDto;
import com.digileave.api.dto.UserResponseDto;
import com.digileave.api.dto.UserRoleUpdateDto;
import com.digileave.api.dto.UserTeamUpdateDto;
import com.digileave.api.service.UserService;
import com.digileave.api.service.YearEndService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * REST controller for user management.
 * All exception handling is delegated to {@link com.digileave.api.exception.GlobalExceptionHandler}.
 */
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService    userService;
    private final YearEndService yearEndService;

    public UserController(UserService userService, YearEndService yearEndService) {
        this.userService    = userService;
        this.yearEndService = yearEndService;
    }

    @GetMapping
    public ResponseEntity<List<UserResponseDto>> getAllUsers(
            @RequestParam(required = false) String name,
            @RequestParam(required = false) String email,
            @RequestParam(required = false) String role,
            @RequestParam(required = false) String team) {
        return ResponseEntity.ok(userService.getAllUsers(name, email, role, team));
    }

    /**
     * GET /api/users/managed?requesterId={id}
     * ADMIN → all users; APPROVER → their direct reports; others → 403.
     */
    @GetMapping("/managed")
    public ResponseEntity<List<UserResponseDto>> getManagedUsers(@RequestParam String requesterId) {
        return ResponseEntity.ok(userService.getManagedUsers(requesterId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserResponseDto> getUser(@PathVariable String id) {
        return ResponseEntity.ok(userService.getUser(id));
    }

    @PatchMapping("/{id}/role")
    public ResponseEntity<UserResponseDto> updateRole(
            @PathVariable String id,
            @RequestBody UserRoleUpdateDto dto) {
        return ResponseEntity.ok(userService.updateRole(id, dto.getRole()));
    }

    @PatchMapping("/{id}/approver")
    public ResponseEntity<UserResponseDto> updateApprover(
            @PathVariable String id,
            @RequestBody UserApproverUpdateDto dto) {
        return ResponseEntity.ok(userService.updateApprovers(id, dto.getApproverEmails()));
    }

    @PatchMapping("/{id}/team")
    public ResponseEntity<UserResponseDto> updateTeam(
            @PathVariable String id,
            @RequestBody UserTeamUpdateDto dto) {
        return ResponseEntity.ok(userService.updateTeam(id, dto.getTeam()));
    }

    /**
     * PATCH /api/users/{id}/balance
     * Sets entitled days and the one-off accounting adjustment.
     */
    @PatchMapping("/{id}/balance")
    public ResponseEntity<UserResponseDto> adjustBalance(
            @PathVariable String id,
            @Valid @RequestBody BalanceAdjustmentDto dto) {
        return ResponseEntity.ok(
                userService.adjustBalance(id, dto.getEntitled(), dto.getStartingBalanceAdjustment()));
    }

    /**
     * POST /api/users/year-end-rollover?newEntitledDays={n}
     */
    @PostMapping("/year-end-rollover")
    public ResponseEntity<Map<String, Object>> yearEndRollover(
            @RequestParam(required = false) Integer newEntitledDays) {
        int updated = yearEndService.performRollover(newEntitledDays);
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "usersUpdated", updated,
                "newEntitledDays", newEntitledDays != null ? newEntitledDays : "unchanged"
        ));
    }
}
