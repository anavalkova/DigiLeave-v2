package com.digileave.api.service;

import com.digileave.api.dto.CalendarEventDto;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
        // ── 0. Require a non-null userId from the caller ───────────────────
        if (dto.getUserId() == null || dto.getUserId().isBlank()) {
            throw new IllegalArgumentException("User is not authenticated.");
        }

        LocalDate startDate = dto.getStartDate();
        LocalDate endDate   = dto.getEndDate();

        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Start date and end date are required.");
        }

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

        if (totalDays <= 0) {
            throw new IllegalArgumentException(
                    "The selected date range contains no working days " +
                    "(all days are weekends or public holidays).");
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

        int rejectedDays = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.REJECTED)
                .stream().mapToInt(LeaveRequest::getTotalDays).sum();

        int remainingDays = entitledDays - usedDays;

        return new LeaveSummaryDto(entitledDays, usedDays, pendingDays, remainingDays, rejectedDays);
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
                user.setUsedDays(approvedDays);
                userRepository.save(user);
            });
        }

        return saved;
    }

    /**
     * Approves a leave request, deducting days from the user's balance exactly once.
     * Calling this on an already-APPROVED request is a no-op to prevent double-deduction.
     */
    public LeaveRequest approveRequest(String requestId) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        // Idempotency guard — prevent double-deduction
        if (request.getStatus() == LeaveStatus.APPROVED) {
            return request;
        }

        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "User associated with this request was not found."));

        int days = request.getTotalDays();

        user.setRemainingDays(Math.max(0, user.getRemainingDays() - days));
        user.setUsedDays(user.getUsedDays() + days);

        request.setStatus(LeaveStatus.APPROVED);

        userRepository.save(user);
        return leaveRequestRepository.save(request);
    }

    private static final ZoneId SOFIA = ZoneId.of("Europe/Sofia");

    /**
     * Cancels a leave request owned by requestingUserId.
     *
     * Rules:
     *  - Only the submitter may cancel their own request.
     *  - Already-started or past requests (startDate < today Sofia time) cannot be cancelled.
     *  - REJECTED / already-CANCELLED requests cannot be cancelled.
     *  - If the request was APPROVED, the days are refunded to the user's balance.
     */
    public LeaveRequest cancelRequest(String requestId, String requestingUserId) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        if (!requestingUserId.equals(request.getUserId())) {
            throw new IllegalArgumentException("You can only cancel your own requests.");
        }

        LocalDate today = LocalDate.now(SOFIA);
        if (request.getStartDate().isBefore(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot cancel a request whose start date has already passed.");
        }

        LeaveStatus current = request.getStatus();
        if (current == LeaveStatus.CANCELLED) {
            return request;
        }
        if (current == LeaveStatus.REJECTED) {
            throw new IllegalArgumentException("Rejected requests cannot be cancelled.");
        }

        // Exact reversal of approval math — add totalDays back, subtract from usedDays
        if (current == LeaveStatus.APPROVED) {
            userRepository.findById(request.getUserId()).ifPresent(user -> {
                user.setRemainingDays(user.getRemainingDays() + request.getTotalDays());
                user.setUsedDays(Math.max(0, user.getUsedDays() - request.getTotalDays()));
                userRepository.save(user);
            });
        }

        request.setStatus(LeaveStatus.CANCELLED);
        return leaveRequestRepository.save(request);
    }

    /**
     * Rejects a leave request.
     * If the request was previously APPROVED the days are restored to the user's
     * balance — exact reverse of approveRequest.
     */
    public LeaveRequest rejectRequest(String requestId) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        if (request.getStatus() == LeaveStatus.REJECTED) {
            return request; // idempotent
        }

        boolean wasApproved = request.getStatus() == LeaveStatus.APPROVED;

        request.setStatus(LeaveStatus.REJECTED);

        // Reverse the approval math before saving the request
        if (wasApproved && request.getUserId() != null) {
            userRepository.findById(request.getUserId()).ifPresent(user -> {
                user.setRemainingDays(user.getRemainingDays() + request.getTotalDays());
                user.setUsedDays(Math.max(0, user.getUsedDays() - request.getTotalDays()));
                userRepository.save(user);
            });
        }

        return leaveRequestRepository.save(request);
    }

    /**
     * Returns ALL requests visible to the caller (all statuses — audit log view):
     *  - ADMIN    → every request company-wide
     *  - APPROVER → every request routed to their email (any status)
     *  - Others   → empty list
     *
     * Each entry is enriched with the submitter's name and email.
     */
    public List<PendingRequestDto> getPendingRequests(String currentUserId) {
        User caller = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        List<LeaveRequest> pending;
        if (caller.getRole() == Role.ADMIN) {
            pending = leaveRequestRepository.findAll();
        } else if (caller.getRole() == Role.APPROVER) {
            pending = leaveRequestRepository.findByApproverEmailsContaining(caller.getEmail());
        } else {
            return List.of();
        }

        return pending.stream()
                .map(req -> {
                    User submitter = req.getUserId() != null
                            ? userRepository.findById(req.getUserId()).orElse(null)
                            : null;
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

    // ── Team calendar ─────────────────────────────────────────────────────────

    /**
     * Returns APPROVED and PENDING leave events that overlap with the given
     * month, scoped to the set of users visible to the caller:
     *   ADMIN    → everyone
     *   APPROVER → themselves + their direct reports
     *   USER     → themselves + teammates (users sharing at least one approver)
     */
    public List<CalendarEventDto> getCalendarEvents(String viewerId, int year, int month) {
        User viewer = userRepository.findById(viewerId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        List<User> visibleUsers = getVisibleUsers(viewer);
        Set<String> visibleIds  = visibleUsers.stream()
                .map(User::getId).collect(Collectors.toSet());
        Map<String, User> userMap = visibleUsers.stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        LocalDate monthStart = LocalDate.of(year, month, 1);
        LocalDate monthEnd   = monthStart.withDayOfMonth(monthStart.lengthOfMonth());

        return leaveRequestRepository.findAll().stream()
                .filter(r -> r.getUserId() != null && visibleIds.contains(r.getUserId()))
                .filter(r -> r.getStatus() == LeaveStatus.APPROVED
                          || r.getStatus() == LeaveStatus.PENDING)
                .filter(r -> !r.getEndDate().isBefore(monthStart)
                          && !r.getStartDate().isAfter(monthEnd))
                .map(r -> {
                    User u    = userMap.get(r.getUserId());
                    String nm = u != null ? u.getName() : "Unknown";
                    return new CalendarEventDto(
                            r.getId(), r.getUserId(), nm,
                            r.getStartDate(), r.getEndDate(),
                            r.getType(), r.getStatus().name());
                })
                .collect(Collectors.toList());
    }

    private List<User> getVisibleUsers(User viewer) {
        List<User> all = userRepository.findAll();

        if (viewer.getRole() == Role.ADMIN) {
            return all;
        }

        if (viewer.getRole() == Role.APPROVER) {
            String viewerEmail = viewer.getEmail();
            return all.stream()
                    .filter(u -> u.getId().equals(viewer.getId()) ||
                            (u.getApproverEmails() != null &&
                             u.getApproverEmails().contains(viewerEmail)))
                    .collect(Collectors.toList());
        }

        // USER / ACCOUNTANT / others: see teammates — people who share an approver
        Set<String> myApprovers = viewer.getApproverEmails() != null
                ? new HashSet<>(viewer.getApproverEmails())
                : Collections.emptySet();

        return all.stream()
                .filter(u -> {
                    if (u.getId().equals(viewer.getId())) return true;
                    if (u.getApproverEmails() == null || u.getApproverEmails().isEmpty()) return false;
                    return u.getApproverEmails().stream().anyMatch(myApprovers::contains);
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
