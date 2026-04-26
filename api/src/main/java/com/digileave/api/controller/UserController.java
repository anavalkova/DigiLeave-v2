package com.digileave.api.controller;

import com.digileave.api.dto.BalanceAdjustmentDto;
import com.digileave.api.dto.UserApproverUpdateDto;
import com.digileave.api.dto.UserRoleUpdateDto;
import com.digileave.api.dto.UserTeamUpdateDto;
import com.digileave.api.model.User;
import com.digileave.api.service.UserService;
import com.digileave.api.service.YearEndService;
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
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

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
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }

    /**
     * GET /api/users/managed?requesterId={id}
     * ADMIN → all users; APPROVER → their direct reports; others → 403.
     */
    @GetMapping("/managed")
    public ResponseEntity<List<User>> getManagedUsers(@RequestParam String requesterId) {
        try {
            return ResponseEntity.ok(userService.getManagedUsers(requesterId));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode()).build();
        }
    }

    @GetMapping("/{id}")
    public ResponseEntity<User> getUser(@PathVariable String id) {
        try {
            return ResponseEntity.ok(userService.getUser(id));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @PatchMapping("/{id}/role")
    public ResponseEntity<User> updateRole(
            @PathVariable String id,
            @RequestBody UserRoleUpdateDto dto) {
        try {
            return ResponseEntity.ok(userService.updateRole(id, dto.getRole()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PatchMapping("/{id}/approver")
    public ResponseEntity<User> updateApprover(
            @PathVariable String id,
            @RequestBody UserApproverUpdateDto dto) {
        try {
            return ResponseEntity.ok(userService.updateApprovers(id, dto.getApproverEmails()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PatchMapping("/{id}/team")
    public ResponseEntity<User> updateTeam(
            @PathVariable String id,
            @RequestBody UserTeamUpdateDto dto) {
        try {
            return ResponseEntity.ok(userService.updateTeam(id, dto.getTeam()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * PATCH /api/users/{id}/balance
     * Sets entitled days and the one-off accounting adjustment.
     * The transferred field is managed exclusively by the year-end rollover.
     */
    @PatchMapping("/{id}/balance")
    public ResponseEntity<User> adjustBalance(
            @PathVariable String id,
            @RequestBody BalanceAdjustmentDto dto) {
        try {
            return ResponseEntity.ok(userService.adjustBalance(
                    id, dto.getEntitled(), dto.getStartingBalanceAdjustment()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * POST /api/users/year-end-rollover?newEntitledDays={n}
     * Carries over each user's remaining balance to the new year and resets
     * the used counter.  Restricted to ADMIN callers (checked via requesterId).
     *
     * @param newEntitledDays  Days to grant for the new year (optional — omit to
     *                         keep each user's existing entitled value unchanged).
     */
    @PostMapping("/year-end-rollover")
    public ResponseEntity<Map<String, Object>> yearEndRollover(
            @RequestParam(required = false) Integer newEntitledDays) {
        try {
            int updated = yearEndService.performRollover(newEntitledDays);
            return ResponseEntity.ok(Map.of(
                    "status", "ok",
                    "usersUpdated", updated,
                    "newEntitledDays", newEntitledDays != null ? newEntitledDays : "unchanged"
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }
}
