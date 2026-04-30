package com.digileave.api.service;

import com.digileave.api.dto.UserResponseDto;
import com.digileave.api.mapper.DtoMapper;
import com.digileave.api.model.AnnualLeaveBalance;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.Role;
import com.digileave.api.model.Team;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository         userRepository;
    private final LeaveRequestRepository leaveRequestRepository;
    private final AuditLogService        auditLogService;
    private final DtoMapper              mapper;

    public UserService(UserRepository userRepository,
                       LeaveRequestRepository leaveRequestRepository,
                       AuditLogService auditLogService,
                       DtoMapper mapper) {
        this.userRepository         = userRepository;
        this.leaveRequestRepository = leaveRequestRepository;
        this.auditLogService        = auditLogService;
        this.mapper                 = mapper;
    }

    /**
     * Returns all users, optionally filtered by name, email, role, or team.
     * All filter parameters are case-insensitive; blank/null values are ignored.
     *
     * @param name  substring match on display name
     * @param email substring match on email address
     * @param role  exact match on {@link Role} name (e.g. "ADMIN")
     * @param team  exact match on {@link Team} name (e.g. "OPR")
     * @return filtered list of user DTOs, ordered by MongoDB natural order
     */
    public List<UserResponseDto> getAllUsers(String name, String email, String role, String team) {
        List<User> users = userRepository.findAll();

        if (name != null && !name.isBlank()) {
            String lc = name.toLowerCase();
            users = users.stream()
                    .filter(u -> u.getName() != null && u.getName().toLowerCase().contains(lc))
                    .toList();
        }
        if (email != null && !email.isBlank()) {
            String lc = email.toLowerCase();
            users = users.stream()
                    .filter(u -> u.getEmail() != null && u.getEmail().toLowerCase().contains(lc))
                    .toList();
        }
        if (role != null && !role.isBlank()) {
            try {
                Role r = Role.valueOf(role.toUpperCase());
                users = users.stream().filter(u -> r.equals(u.getRole())).toList();
            } catch (IllegalArgumentException ignored) {}
        }
        if (team != null && !team.isBlank()) {
            try {
                Team t = Team.valueOf(team.toUpperCase());
                users = users.stream().filter(u -> t.equals(u.getTeam())).toList();
            } catch (IllegalArgumentException ignored) {}
        }

        return users.stream().map(mapper::toUserResponse).collect(Collectors.toList());
    }

    /**
     * Fetches a single user by ID.
     *
     * @param userId the MongoDB document ID
     * @return the user DTO
     * @throws IllegalArgumentException if no user exists with the given ID
     */
    public UserResponseDto getUser(String userId) {
        return mapper.toUserResponse(
                userRepository.findById(userId)
                        .orElseThrow(() -> new IllegalArgumentException("User not found.")));
    }

    /**
     * Updates a user's application role.
     *
     * @param userId the target user's ID
     * @param role   the new role
     * @return the updated user DTO
     * @throws IllegalArgumentException if no user exists with the given ID
     */
    public UserResponseDto updateRole(String userId, Role role) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        user.setRole(role);
        return mapper.toUserResponse(userRepository.save(user));
    }

    /**
     * Updates the approver list for a user.
     * The user's own email is silently removed from the list to prevent
     * self-approval.
     *
     * @param userId         the target user's ID
     * @param approverEmails the new list of approver email addresses
     * @return the updated user DTO
     * @throws IllegalArgumentException if no user exists with the given ID
     */
    public UserResponseDto updateApprovers(String userId, List<String> approverEmails) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        List<String> sanitised = approverEmails == null
                ? new ArrayList<>()
                : new ArrayList<>(approverEmails);
        sanitised.remove(user.getEmail());
        user.setApproverEmails(sanitised);
        return mapper.toUserResponse(userRepository.save(user));
    }

    /**
     * Updates the two admin-settable components of a user's annual leave balance:
     * {@code entitled} (the current-year quota) and
     * {@code startingBalanceAdjustment} (manual sync with accounting).
     *
     * The {@code transferred} field is managed exclusively by
     * {@link YearEndService#performRollover} and is never touched here.
     * The {@code used} counter is recomputed from approved leave records
     * to prevent drift.
     *
     * @param userId                    the target user's ID
     * @param entitled                  the new entitled days quota
     * @param startingBalanceAdjustment the manual accounting adjustment (may be negative)
     * @return the updated user DTO
     * @throws IllegalArgumentException if no user exists with the given ID
     */
    public UserResponseDto adjustBalance(String userId, int entitled, int startingBalanceAdjustment) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        AnnualLeaveBalance before = getBalance(user);

        AnnualLeaveBalance bal = getBalance(user);
        bal.setEntitled(entitled);
        bal.setStartingBalanceAdjustment(startingBalanceAdjustment);

        double actualUsed = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.APPROVED)
                .stream()
                .filter(r -> LeaveService.affectsBalance(r.getType()))
                .mapToDouble(lr -> lr.getTotalDays())
                .sum();
        bal.setUsed(actualUsed);

        user.setAnnualLeave(bal);
        User saved = userRepository.save(user);

        String actorId = currentActorId();
        auditLogService.log(actorId, userId, "BALANCE_ADJUSTED", before, bal);

        return mapper.toUserResponse(saved);
    }

    /**
     * Updates a user's team assignment. Passing {@code null} clears the assignment.
     *
     * @param userId the target user's ID
     * @param team   the new team, or null to unassign
     * @return the updated user DTO
     * @throws IllegalArgumentException if no user exists with the given ID
     */
    public UserResponseDto updateTeam(String userId, Team team) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        user.setTeam(team);
        return mapper.toUserResponse(userRepository.save(user));
    }

    /**
     * Returns the users visible to the requester:
     * <ul>
     *   <li>ADMIN    → all users</li>
     *   <li>APPROVER → only their direct reports</li>
     *   <li>Others   → 403 Forbidden</li>
     * </ul>
     *
     * @param requesterId the requesting user's ID
     * @return list of user DTOs the requester is permitted to see
     * @throws IllegalArgumentException    if the requester is not found
     * @throws ResponseStatusException     (403) if the requester lacks permission
     */
    public List<UserResponseDto> getManagedUsers(String requesterId) {
        User requester = userRepository.findById(requesterId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        if (requester.getRole() == Role.ADMIN) {
            return userRepository.findAll().stream()
                    .map(mapper::toUserResponse).collect(Collectors.toList());
        }

        if (requester.getRole() == Role.APPROVER) {
            String email = requester.getEmail();
            return userRepository.findAll().stream()
                    .filter(u -> u.getApproverEmails() != null
                              && u.getApproverEmails().contains(email))
                    .map(mapper::toUserResponse)
                    .collect(Collectors.toList());
        }

        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied.");
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private static String currentActorId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) return "system";
        return auth.getPrincipal().toString();
    }

    /** Reads the balance, initialising from legacy fields on un-migrated documents. */
    private AnnualLeaveBalance getBalance(User user) {
        if (user.getAnnualLeave() != null) return user.getAnnualLeave();
        AnnualLeaveBalance b = new AnnualLeaveBalance();
        b.setEntitled(user.getEntitledDays());
        b.setUsed(user.getUsedDays());
        return b;
    }
}
