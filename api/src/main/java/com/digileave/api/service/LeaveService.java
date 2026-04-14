package com.digileave.api.service;

import com.digileave.api.dto.LeaveRequestDto;
import com.digileave.api.dto.LeaveSummaryDto;
import com.digileave.api.dto.PendingRequestDto;
import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.Role;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import com.digileave.api.util.BulgarianPublicHolidays;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class LeaveService {

    private final LeaveRequestRepository leaveRequestRepository;
    private final UserRepository userRepository;

    public LeaveService(LeaveRequestRepository leaveRequestRepository,
                        UserRepository userRepository) {
        this.leaveRequestRepository = leaveRequestRepository;
        this.userRepository = userRepository;
    }

    public LeaveRequest createRequest(LeaveRequestDto dto) {
        LocalDate startDate = dto.getStartDate();
        LocalDate endDate   = dto.getEndDate();

        // ── 1. Past-date guard ─────────────────────────────────────────────
        if (startDate.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException(
                    "Leave requests cannot be submitted for dates in the past.");
        }

        // ── 2. Date-order sanity ───────────────────────────────────────────
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException(
                    "End date cannot be before start date.");
        }

        // ── 3. Overlap check (PENDING or APPROVED requests) ────────────────
        List<LeaveRequest> active = leaveRequestRepository.findByUserIdAndStatusIn(
                dto.getUserId(), List.of(LeaveStatus.PENDING, LeaveStatus.APPROVED));

        boolean overlaps = active.stream().anyMatch(existing ->
                !existing.getStartDate().isAfter(endDate) &&
                !existing.getEndDate().isBefore(startDate));

        if (overlaps) {
            throw new IllegalArgumentException(
                    "You already have a leave request that overlaps with these dates.");
        }

        // ── 4. Workday count (weekends + Bulgarian public holidays excluded) ─
        int totalDays = calculateWorkdays(startDate, endDate);

        if (totalDays == 0) {
            throw new IllegalArgumentException(
                    "The selected date range contains no working days.");
        }

        // ── 5. Balance check (entitled − approved − pending) ───────────────
        User user = userRepository.findById(dto.getUserId())
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        int approvedDays = leaveRequestRepository
                .findByUserIdAndStatus(dto.getUserId(), LeaveStatus.APPROVED)
                .stream().mapToInt(LeaveRequest::getTotalDays).sum();

        int pendingDays = leaveRequestRepository
                .findByUserIdAndStatus(dto.getUserId(), LeaveStatus.PENDING)
                .stream().mapToInt(LeaveRequest::getTotalDays).sum();

        int availableDays = user.getEntitledDays() - approvedDays - pendingDays;

        if (totalDays > availableDays) {
            throw new IllegalArgumentException(
                    "Request exceeds your available leave balance of " + availableDays + " day(s)." +
                    " Note: days already pending count against your balance.");
        }

        // ── 6. Save ────────────────────────────────────────────────────────
        LeaveRequest request = new LeaveRequest();
        request.setUserId(dto.getUserId());
        request.setStartDate(startDate);
        request.setEndDate(endDate);
        request.setType(dto.getType());
        request.setStatus(LeaveStatus.PENDING);
        request.setTotalDays(totalDays);
        request.setRequestDate(LocalDate.now());
        // Stamp the approver list at submission time so routing is immutable
        request.setApproverEmails(user.getApproverEmails());
        return leaveRequestRepository.save(request);
    }

    public List<LeaveRequest> getRequestsByUser(String userId) {
        return leaveRequestRepository.findByUserId(userId);
    }

    public LeaveSummaryDto getUserLeaveSummary(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        int entitledDays = user.getEntitledDays();

        int usedDays = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.APPROVED)
                .stream().mapToInt(LeaveRequest::getTotalDays).sum();

        int pendingDays = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.PENDING)
                .stream().mapToInt(LeaveRequest::getTotalDays).sum();

        int remainingDays = entitledDays - usedDays;

        return new LeaveSummaryDto(entitledDays, usedDays, pendingDays, remainingDays);
    }

    /**
     * Transitions a leave request to a new status and keeps the user's
     * stored remainingDays in sync whenever the APPROVED state changes.
     */
    public LeaveRequest updateRequestStatus(String requestId, LeaveStatus newStatus) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        LeaveStatus oldStatus = request.getStatus();
        request.setStatus(newStatus);
        LeaveRequest saved = leaveRequestRepository.save(request);

        // Sync user.remainingDays whenever approval state changes
        boolean approvalStateChanged = oldStatus != newStatus &&
                (oldStatus == LeaveStatus.APPROVED || newStatus == LeaveStatus.APPROVED);

        if (approvalStateChanged) {
            userRepository.findById(request.getUserId()).ifPresent(user -> {
                int approvedDays = leaveRequestRepository
                        .findByUserIdAndStatus(request.getUserId(), LeaveStatus.APPROVED)
                        .stream().mapToInt(LeaveRequest::getTotalDays).sum();
                user.setRemainingDays(Math.max(0, user.getEntitledDays() - approvedDays));
                userRepository.save(user);
            });
        }

        return saved;
    }

    /**
     * Returns PENDING requests visible to the caller:
     *  - ADMIN  → all pending requests company-wide
     *  - APPROVER → only pending requests routed to their email
     *  - Others → empty list (they have no approval authority)
     *
     * Each entry is enriched with the submitter's name and email so the
     * approver UI doesn't need a separate user lookup.
     */
    public List<PendingRequestDto> getPendingRequests(String currentUserId) {
        User caller = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        List<LeaveRequest> pending;
        if (caller.getRole() == Role.ADMIN) {
            pending = leaveRequestRepository.findByStatus(LeaveStatus.PENDING);
        } else if (caller.getRole() == Role.APPROVER) {
            pending = leaveRequestRepository.findByStatusAndApproverEmailsContaining(
                    LeaveStatus.PENDING, caller.getEmail());
        } else {
            return List.of();
        }

        return pending.stream()
                .map(req -> {
                    User submitter = userRepository.findById(req.getUserId()).orElse(null);
                    String uName  = submitter != null ? submitter.getName()  : "Unknown";
                    String uEmail = submitter != null ? submitter.getEmail() : "";
                    return new PendingRequestDto(
                            req.getId(),
                            req.getUserId(),
                            uName,
                            uEmail,
                            req.getStartDate(),
                            req.getEndDate(),
                            req.getType(),
                            req.getTotalDays(),
                            req.getRequestDate(),
                            req.getStatus()
                    );
                })
                .collect(Collectors.toList());
    }

    // ── Workday calculation ────────────────────────────────────────────────────

    private int calculateWorkdays(LocalDate start, LocalDate end) {
        int count = 0;
        LocalDate current = start;
        while (!current.isAfter(end)) {
            if (isWorkday(current)) {
                count++;
            }
            current = current.plusDays(1);
        }
        return count;
    }

    private boolean isWorkday(LocalDate date) {
        DayOfWeek day = date.getDayOfWeek();
        return day != DayOfWeek.SATURDAY
                && day != DayOfWeek.SUNDAY
                && !BulgarianPublicHolidays.isHoliday(date);
    }
}
