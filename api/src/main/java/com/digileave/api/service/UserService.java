package com.digileave.api.service;

import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.Role;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.ArrayList;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final LeaveRequestRepository leaveRequestRepository;

    public UserService(UserRepository userRepository,
                       LeaveRequestRepository leaveRequestRepository) {
        this.userRepository = userRepository;
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
        List<String> sanitised = approverEmails == null ? new ArrayList<>() : new ArrayList<>(approverEmails);
        sanitised.remove(user.getEmail()); // users must not be their own approver
        user.setApproverEmails(sanitised);
        return userRepository.save(user);
    }

    public User updateEntitlement(String userId, int entitledDays) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));
        user.setEntitledDays(entitledDays);
        int usedDays = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.APPROVED)
                .stream().mapToInt(LeaveRequest::getTotalDays).sum();
        user.setRemainingDays(Math.max(0, entitledDays - usedDays));
        return userRepository.save(user);
    }
}
