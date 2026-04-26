package com.digileave.api.service;

import com.digileave.api.model.AnnualLeaveBalance;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.Role;
import com.digileave.api.model.Team;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class UserService {

    private final UserRepository         userRepository;
    private final LeaveRequestRepository leaveRequestRepository;

    public UserService(UserRepository userRepository,
                       LeaveRequestRepository leaveRequestRepository) {
        this.userRepository         = userRepository;
        this.leaveRequestRepository = leaveRequestRepository;
    }

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    public User getUser(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
    }

    public User updateRole(String userId, Role role) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        user.setRole(role);
        return userRepository.save(user);
    }

    public User updateApprovers(String userId, List<String> approverEmails) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        List<String> sanitised = approverEmails == null
                ? new ArrayList<>()
                : new ArrayList<>(approverEmails);
        sanitised.remove(user.getEmail());
        user.setApproverEmails(sanitised);
        return userRepository.save(user);
    }

    /**
     * Updates the two admin-settable components of the annual leave balance:
     * {@code entitled} (the current-year quota) and
     * {@code startingBalanceAdjustment} (manual sync with accounting).
     *
     * The {@code transferred} field is managed exclusively by
     * {@link YearEndService#performRollover} and is never touched here.
     * The {@code used} counter is recomputed from approved leave records
     * to prevent drift.
     */
    public User adjustBalance(String userId, int entitled, int startingBalanceAdjustment) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        AnnualLeaveBalance bal = getBalance(user);
        bal.setEntitled(entitled);
        bal.setStartingBalanceAdjustment(startingBalanceAdjustment);

        // Recompute used from the ledger (double to support half-day requests)
        double actualUsed = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.APPROVED)
                .stream()
                .filter(r -> LeaveService.affectsBalance(r.getType()))
                .mapToDouble(lr -> lr.getTotalDays())
                .sum();
        bal.setUsed(actualUsed);

        user.setAnnualLeave(bal);
        return userRepository.save(user);
    }

    public User updateTeam(String userId, Team team) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        user.setTeam(team);
        return userRepository.save(user);
    }

    /**
     * Returns the users visible to the requester:
     *   ADMIN    → all users
     *   APPROVER → only their direct reports
     *   Others   → 403
     */
    public List<User> getManagedUsers(String requesterId) {
        User requester = userRepository.findById(requesterId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        if (requester.getRole() == Role.ADMIN) {
            return userRepository.findAll();
        }

        if (requester.getRole() == Role.APPROVER) {
            String email = requester.getEmail();
            return userRepository.findAll().stream()
                    .filter(u -> u.getApproverEmails() != null
                              && u.getApproverEmails().contains(email))
                    .collect(Collectors.toList());
        }

        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied.");
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /** Reads the balance, initialising from legacy fields on un-migrated documents. */
    private AnnualLeaveBalance getBalance(User user) {
        if (user.getAnnualLeave() != null) return user.getAnnualLeave();
        AnnualLeaveBalance b = new AnnualLeaveBalance();
        b.setEntitled(user.getEntitledDays());
        b.setUsed(user.getUsedDays());
        return b;
    }
}
