package com.digileave.api.controller;

import com.digileave.api.dto.UserApproverUpdateDto;
import com.digileave.api.dto.UserEntitlementUpdateDto;
import com.digileave.api.dto.UserRoleUpdateDto;
import com.digileave.api.model.User;
import com.digileave.api.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
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

    @PatchMapping("/{id}/entitlement")
    public ResponseEntity<User> updateEntitlement(
            @PathVariable String id,
            @RequestBody UserEntitlementUpdateDto dto) {
        try {
            return ResponseEntity.ok(userService.updateEntitlement(id, dto.getEntitledDays()));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
