package com.digileave.api.service;

import com.digileave.api.dto.CalendarEventDto;
import com.digileave.api.dto.LeaveRequestDto;
import com.digileave.api.dto.LeaveSummaryDto;
import com.digileave.api.dto.PendingRequestDto;
import com.digileave.api.exception.ValidationException;
import com.digileave.api.model.AnnualLeaveBalance;
import com.digileave.api.model.HalfDaySlot;
import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.Role;
import com.digileave.api.model.Team;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import com.digileave.api.util.BulgarianPublicHolidays;
import com.digileave.api.util.XssUtils;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class LeaveService {

    private final LeaveRequestRepository leaveRequestRepository;
    private final UserRepository         userRepository;
    private final AuditLogService        auditLogService;
    private final EmailService           emailService;

    public LeaveService(LeaveRequestRepository leaveRequestRepository,
                        UserRepository userRepository,
                        AuditLogService auditLogService,
                        EmailService emailService) {
        this.leaveRequestRepository = leaveRequestRepository;
        this.userRepository         = userRepository;
        this.auditLogService        = auditLogService;
        this.emailService           = emailService;
    }

    // ── Balance / type helpers ────────────────────────────────────────────────

    /**
     * Only annual leave counts against the entitlement balance.
     *
     * Accepts both the canonical key format ("annual") used by new requests
     * and the legacy label format ("Annual Leave") that may exist in older records.
     * Point 3 — balance isolation: HOME_OFFICE, SICK_LEAVE, and UNPAID_LEAVE
     * explicitly do NOT affect the paid-leave balance.
     */
    static boolean affectsBalance(String type) {
        if (type == null) return false;
        String lower = type.toLowerCase().trim();
        return lower.equals("annual") || lower.equals("annual leave");
    }

    /**
     * Returns the user's AnnualLeaveBalance, initialising it on-the-fly from
     * legacy fields if the document pre-dates the ledger migration.
     */
    private AnnualLeaveBalance getBalance(User user) {
        if (user.getAnnualLeave() != null) return user.getAnnualLeave();
        AnnualLeaveBalance b = new AnnualLeaveBalance();
        b.setEntitled(user.getEntitledDays());
        b.setUsed(user.getUsedDays());
        return b;
    }

    /**
     * Recomputes {@code annualLeave.used} from approved leave records and
     * persists it.  Always called after any approval-state change so the
     * stored counter never drifts from the ledger.
     */
    private void syncUsed(User user) {
        double approvedDays = leaveRequestRepository
                .findByUserIdAndStatus(user.getId(), LeaveStatus.APPROVED)
                .stream()
                .filter(r -> affectsBalance(r.getType()))
                .mapToDouble(LeaveRequest::getTotalDays)
                .sum();

        AnnualLeaveBalance bal = getBalance(user);
        bal.setUsed(approvedDays);
        user.setAnnualLeave(bal);
        userRepository.save(user);
    }

    // ── Request lifecycle ─────────────────────────────────────────────────────

    /**
     * Creates and persists a new leave request.
     *
     * Validation order:
     * <ol>
     *   <li>Authentication guard — userId must be present</li>
     *   <li>Past-date guard — start date must not be in the past</li>
     *   <li>Date-order sanity — end must not precede start</li>
     *   <li>Slot-aware overlap check against PENDING and APPROVED requests</li>
     *   <li>Workday count — request must span at least one working day</li>
     *   <li>Balance check — only for annual-leave type</li>
     * </ol>
     *
     * @param dto the incoming leave request payload
     * @return the persisted {@link LeaveRequest}
     * @throws ValidationException      for any business-rule violation
     * @throws IllegalArgumentException if the user is not found
     */
    public LeaveRequest createRequest(LeaveRequestDto dto) {
        if (dto.getUserId() == null || dto.getUserId().isBlank()) {
            throw new ValidationException("User is not authenticated.");
        }

        LocalDate startDate = dto.getStartDate();
        LocalDate endDate   = dto.getEndDate();

        if (startDate == null || endDate == null) {
            throw new ValidationException("Start date and end date are required.");
        }

        if (startDate.isBefore(LocalDate.now())) {
            throw new ValidationException(
                    "Leave requests cannot be submitted for dates in the past.");
        }

        if (endDate.isBefore(startDate)) {
            throw new ValidationException("End date cannot be before start date.");
        }

        HalfDaySlot newSlot = dto.getHalfDaySlot() != null ? dto.getHalfDaySlot() : HalfDaySlot.NONE;

        List<LeaveRequest> active = leaveRequestRepository.findByUserIdAndStatusIn(
                dto.getUserId(), List.of(LeaveStatus.PENDING, LeaveStatus.APPROVED));

        boolean overlaps = active.stream()
                .anyMatch(existing -> conflictsWithSlot(existing, startDate, endDate, newSlot));

        if (overlaps) {
            throw new ValidationException(
                    "You already have a leave request that overlaps with these dates and time slot.");
        }

        double totalDays = calculateWorkdays(startDate, endDate, dto.isHalfDay());

        if (totalDays <= 0) {
            throw new ValidationException(
                    "The selected date range contains no working days " +
                    "(all days are weekends or public holidays).");
        }

        User user = userRepository.findById(dto.getUserId())
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        if (affectsBalance(dto.getType())) {
            AnnualLeaveBalance bal = getBalance(user);

            double approvedDays = leaveRequestRepository
                    .findByUserIdAndStatus(dto.getUserId(), LeaveStatus.APPROVED)
                    .stream()
                    .filter(r -> affectsBalance(r.getType()))
                    .mapToDouble(LeaveRequest::getTotalDays)
                    .sum();

            double pendingDays = leaveRequestRepository
                    .findByUserIdAndStatus(dto.getUserId(), LeaveStatus.PENDING)
                    .stream()
                    .filter(r -> affectsBalance(r.getType()))
                    .mapToDouble(LeaveRequest::getTotalDays)
                    .sum();

            double totalGranted  = bal.getEntitled() + bal.getTransferred() + bal.getStartingBalanceAdjustment();
            double availableDays = totalGranted - approvedDays - pendingDays;

            if (totalDays > availableDays) {
                throw new ValidationException(
                        "Request exceeds your available leave balance of " + availableDays + " day(s)." +
                        " Note: days already pending count against your balance.");
            }
        }

        LeaveRequest request = new LeaveRequest();
        request.setUserId(dto.getUserId());
        request.setStartDate(startDate);
        request.setEndDate(endDate);
        request.setType(XssUtils.sanitize(dto.getType()));
        request.setStatus(LeaveStatus.PENDING);
        request.setTotalDays(totalDays);
        request.setHalfDay(dto.isHalfDay());
        request.setHalfDaySlot(newSlot);
        request.setRequestDate(LocalDate.now());
        request.setApproverEmails(user.getApproverEmails());
        LeaveRequest saved = leaveRequestRepository.save(request);
        notifyManagersOfNewRequest(saved, user);
        return saved;
    }

    public List<LeaveRequest> getRequestsByUser(
            String userId, String type, String status,
            LocalDate requestDateFrom, LocalDate requestDateTo,
            LocalDate startDateFrom, LocalDate startDateTo) {

        List<LeaveRequest> requests = leaveRequestRepository.findByUserId(userId);

        if (type != null && !type.isBlank()) {
            String lc = type.toLowerCase();
            requests = requests.stream()
                    .filter(r -> r.getType() != null && r.getType().toLowerCase().equals(lc))
                    .toList();
        }
        if (status != null && !status.isBlank()) {
            try {
                LeaveStatus s = LeaveStatus.valueOf(status.toUpperCase());
                requests = requests.stream().filter(r -> r.getStatus() == s).toList();
            } catch (IllegalArgumentException ignored) {}
        }
        if (requestDateFrom != null) {
            requests = requests.stream()
                    .filter(r -> r.getRequestDate() != null && !r.getRequestDate().isBefore(requestDateFrom))
                    .toList();
        }
        if (requestDateTo != null) {
            requests = requests.stream()
                    .filter(r -> r.getRequestDate() != null && !r.getRequestDate().isAfter(requestDateTo))
                    .toList();
        }
        if (startDateFrom != null) {
            requests = requests.stream()
                    .filter(r -> r.getStartDate() != null && !r.getStartDate().isBefore(startDateFrom))
                    .toList();
        }
        if (startDateTo != null) {
            requests = requests.stream()
                    .filter(r -> r.getStartDate() != null && !r.getStartDate().isAfter(startDateTo))
                    .toList();
        }

        return requests;
    }

    public LeaveSummaryDto getUserLeaveSummary(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        AnnualLeaveBalance bal = getBalance(user);

        // Always compute from the ledger of approved/pending requests —
        // never trust the cached used counter for the summary display.
        double used = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.APPROVED)
                .stream()
                .filter(r -> affectsBalance(r.getType()))
                .mapToDouble(LeaveRequest::getTotalDays)
                .sum();

        double pending = leaveRequestRepository
                .findByUserIdAndStatus(userId, LeaveStatus.PENDING)
                .stream()
                .filter(r -> affectsBalance(r.getType()))
                .mapToDouble(LeaveRequest::getTotalDays)
                .sum();

        double available = bal.getEntitled() + bal.getTransferred()
                + bal.getStartingBalanceAdjustment() - used;

        return new LeaveSummaryDto(
                bal.getEntitled(),
                bal.getTransferred(),
                bal.getStartingBalanceAdjustment(),
                used,
                pending,
                available);
    }

    /**
     * Generic status transition (used for paths other than APPROVED / REJECTED).
     * Syncs the ledger whenever the approval state changes.
     */
    public LeaveRequest updateRequestStatus(String requestId, LeaveStatus newStatus) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        LeaveStatus oldStatus = request.getStatus();
        request.setStatus(newStatus);
        LeaveRequest saved = leaveRequestRepository.save(request);

        boolean approvalStateChanged = oldStatus != newStatus &&
                (oldStatus == LeaveStatus.APPROVED || newStatus == LeaveStatus.APPROVED);

        if (approvalStateChanged && affectsBalance(request.getType())) {
            userRepository.findById(request.getUserId()).ifPresent(this::syncUsed);
        }

        return saved;
    }

    /**
     * Approves a leave request and updates the ledger.
     * Idempotent — calling on an already-APPROVED request is a no-op.
     *
     * Point 3 — balance isolation: only annual-leave requests trigger a ledger sync.
     */
    public LeaveRequest approveRequest(String requestId) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        if (request.getStatus() == LeaveStatus.APPROVED) return request;

        User user = userRepository.findById(request.getUserId())
                .orElseThrow(() -> new IllegalArgumentException(
                        "User associated with this request was not found."));

        LeaveStatus before = request.getStatus();
        request.setStatus(LeaveStatus.APPROVED);
        LeaveRequest saved = leaveRequestRepository.save(request);

        // HOME_OFFICE, SICK_LEAVE, UNPAID_LEAVE — do NOT call syncUsed (Point 3)
        if (affectsBalance(request.getType())) {
            syncUsed(user);
        }

        String actorId = currentActorId();
        auditLogService.log(actorId, request.getUserId(), "LEAVE_APPROVED",
                Map.of("requestId", requestId, "status", before.name()),
                Map.of("requestId", requestId, "status", LeaveStatus.APPROVED.name()));

        notifyEmployeeOfDecision(saved, user, LeaveStatus.APPROVED, null, actorId);
        return saved;
    }

    /**
     * Dispatches a status update to the appropriate lifecycle method.
     *
     * APPROVED and REJECTED have dedicated methods with ledger sync and audit logging.
     * All other status transitions fall through to {@link #updateRequestStatus}.
     *
     * @param requestId the leave request ID
     * @param newStatus the target status
     * @return the updated {@link LeaveRequest}
     */
    public LeaveRequest processStatusUpdate(String requestId, LeaveStatus newStatus, String rejectionReason) {
        return switch (newStatus) {
            case APPROVED -> approveRequest(requestId);
            case REJECTED -> rejectRequest(requestId, rejectionReason);
            default       -> updateRequestStatus(requestId, newStatus);
        };
    }

    /**
     * Cancels a leave request owned by requestingUserId.
     * If the request was APPROVED the ledger is recalculated.
     *
     * Any user may cancel their own PENDING or future-APPROVED requests.
     *
     * @param requestId          the leave request ID
     * @param requestingUserId   the ID of the user attempting the cancellation
     * @return the cancelled {@link LeaveRequest}
     * @throws IllegalArgumentException if the request is not found
     * @throws ValidationException      if ownership, date, or status constraints are violated
     */
    public LeaveRequest cancelRequest(String requestId, String requestingUserId) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        if (!requestingUserId.equals(request.getUserId())) {
            throw new ValidationException("You can only cancel your own requests.");
        }

        if (request.getStartDate().isBefore(LocalDate.now(SOFIA))) {
            throw new ValidationException(
                    "Cannot cancel a request whose start date has already passed.");
        }

        LeaveStatus current = request.getStatus();
        if (current == LeaveStatus.CANCELLED) return request;
        if (current == LeaveStatus.REJECTED) {
            throw new ValidationException("Rejected requests cannot be cancelled.");
        }

        boolean wasApproved = current == LeaveStatus.APPROVED;
        request.setStatus(LeaveStatus.CANCELLED);
        LeaveRequest saved = leaveRequestRepository.save(request);

        if (wasApproved && affectsBalance(request.getType())) {
            userRepository.findById(request.getUserId()).ifPresent(this::syncUsed);
        }

        auditLogService.log(requestingUserId, request.getUserId(), "LEAVE_CANCELLED",
                Map.of("requestId", requestId, "status", current.name()),
                Map.of("requestId", requestId, "status", LeaveStatus.CANCELLED.name()));

        return saved;
    }

    /**
     * Rejects a leave request, optionally recording a reason.
     * If the request was previously APPROVED the ledger is recalculated.
     *
     * @param requestId       the leave request to reject
     * @param rejectionReason free-text reason from the approver; may be null or blank
     */
    public LeaveRequest rejectRequest(String requestId, String rejectionReason) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        if (request.getStatus() == LeaveStatus.REJECTED) return request;

        LeaveStatus before = request.getStatus();
        boolean wasApproved = before == LeaveStatus.APPROVED;
        request.setStatus(LeaveStatus.REJECTED);
        request.setRejectionReason(
                (rejectionReason != null && !rejectionReason.isBlank())
                        ? XssUtils.sanitize(rejectionReason.trim())
                        : null);
        LeaveRequest saved = leaveRequestRepository.save(request);

        if (wasApproved && request.getUserId() != null && affectsBalance(request.getType())) {
            userRepository.findById(request.getUserId()).ifPresent(this::syncUsed);
        }

        String actorId = currentActorId();
        auditLogService.log(actorId, request.getUserId(), "LEAVE_REJECTED",
                Map.of("requestId", requestId, "status", before.name()),
                Map.of("requestId", requestId, "status", LeaveStatus.REJECTED.name()));

        userRepository.findById(request.getUserId()).ifPresent(employee ->
                notifyEmployeeOfDecision(saved, employee, LeaveStatus.REJECTED, saved.getRejectionReason(), actorId));
        return saved;
    }

    // ── Approvals / calendar views ────────────────────────────────────────────

    /**
     * Returns pending requests visible to the caller.
     *
     * @param currentUserId  the caller's user ID
     * @param team           optional team filter (OPR / DEV); null means all teams
     */
    public List<PendingRequestDto> getPendingRequests(
            String currentUserId, String team,
            String employeeName, String type, String status,
            LocalDate requestDateFrom, LocalDate requestDateTo,
            LocalDate startDateFrom, LocalDate startDateTo) {

        User caller = userRepository.findById(currentUserId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        List<LeaveRequest> requests;
        if (caller.getRole() == Role.ADMIN) {
            requests = leaveRequestRepository.findAll();
        } else if (caller.getRole() == Role.APPROVER) {
            requests = leaveRequestRepository.findByApproverEmailsContaining(caller.getEmail());
        } else {
            return List.of();
        }

        Map<String, User> userMap = userRepository.findAll().stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        Team teamFilter = parseTeam(team);
        String empLc   = (employeeName != null && !employeeName.isBlank()) ? employeeName.toLowerCase() : null;
        String typeLc  = (type        != null && !type.isBlank())          ? type.toLowerCase()         : null;

        LeaveStatus statusFilter = null;
        if (status != null && !status.isBlank()) {
            try { statusFilter = LeaveStatus.valueOf(status.toUpperCase()); }
            catch (IllegalArgumentException ignored) {}
        }
        final LeaveStatus finalStatus = statusFilter;

        return requests.stream()
                .filter(req -> {
                    User submitter = req.getUserId() != null ? userMap.get(req.getUserId()) : null;

                    if (teamFilter != null && (submitter == null || !teamFilter.equals(submitter.getTeam()))) return false;

                    if (empLc != null) {
                        String n = submitter != null && submitter.getName() != null
                                ? submitter.getName().toLowerCase() : "";
                        if (!n.contains(empLc)) return false;
                    }
                    if (typeLc != null && !typeLc.equals(req.getType() != null ? req.getType().toLowerCase() : "")) return false;
                    if (finalStatus != null && req.getStatus() != finalStatus) return false;

                    if (requestDateFrom != null && (req.getRequestDate() == null || req.getRequestDate().isBefore(requestDateFrom))) return false;
                    if (requestDateTo   != null && (req.getRequestDate() == null || req.getRequestDate().isAfter(requestDateTo)))   return false;
                    if (startDateFrom   != null && (req.getStartDate()   == null || req.getStartDate().isBefore(startDateFrom)))   return false;
                    if (startDateTo     != null && (req.getStartDate()   == null || req.getStartDate().isAfter(startDateTo)))      return false;

                    return true;
                })
                .map(req -> {
                    User submitter = req.getUserId() != null ? userMap.get(req.getUserId()) : null;
                    String uName  = submitter != null ? submitter.getName()  : "Unknown";
                    String uEmail = submitter != null ? submitter.getEmail() : "";
                    HalfDaySlot slot = req.getHalfDaySlot() != null ? req.getHalfDaySlot() : HalfDaySlot.NONE;
                    return new PendingRequestDto(
                            req.getId(), req.getUserId(), uName, uEmail,
                            req.getStartDate(), req.getEndDate(),
                            req.getType(), req.getTotalDays(),
                            req.getRequestDate(), req.getStatus(), slot);
                })
                .collect(Collectors.toList());
    }

    /**
     * Returns calendar events for the given viewer and month.
     *
     * @param viewerId  the viewer's user ID (determines visibility scope)
     * @param year      calendar year
     * @param month     calendar month (1-based)
     * @param team      optional team filter (OPR / DEV); null means all teams
     */
    public List<CalendarEventDto> getCalendarEvents(String viewerId, int year, int month, String team) {
        User viewer = userRepository.findById(viewerId)
                .orElseThrow(() -> new IllegalArgumentException("User not found."));

        List<User> visibleUsers = getVisibleUsers(viewer);

        // Optional team filter
        Team teamFilter = parseTeam(team);
        if (teamFilter != null) {
            visibleUsers = visibleUsers.stream()
                    .filter(u -> teamFilter.equals(u.getTeam()))
                    .collect(Collectors.toList());
        }

        Set<String>       visibleIds = visibleUsers.stream()
                .map(User::getId).collect(Collectors.toSet());
        Map<String, User> userMap    = visibleUsers.stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        LocalDate monthStart = LocalDate.of(year, month, 1);
        LocalDate monthEnd   = monthStart.withDayOfMonth(monthStart.lengthOfMonth());

        return leaveRequestRepository.findAll().stream()
                .filter(r -> r.getUserId() != null && visibleIds.contains(r.getUserId()))
                .filter(r -> r.getStatus() == LeaveStatus.APPROVED
                          || r.getStatus() == LeaveStatus.PENDING)
                .filter(r -> r.getStartDate() != null && r.getEndDate() != null)
                .filter(r -> !r.getEndDate().isBefore(monthStart)
                          && !r.getStartDate().isAfter(monthEnd))
                .map(r -> {
                    User u    = userMap.get(r.getUserId());
                    String nm = u != null ? u.getName()  : "Unknown";
                    String ml = u != null ? u.getEmail() : "";
                    HalfDaySlot slot = r.getHalfDaySlot() != null ? r.getHalfDaySlot() : HalfDaySlot.NONE;
                    return new CalendarEventDto(r.getId(), r.getUserId(), nm, ml,
                            r.getStartDate(), r.getEndDate(), r.getType(), r.getStatus().name(), slot);
                })
                .collect(Collectors.toList());
    }

    private List<User> getVisibleUsers(User viewer) {
        List<User> all = userRepository.findAll();

        if (viewer.getRole() == Role.ADMIN) return all;

        if (viewer.getRole() == Role.APPROVER) {
            String viewerEmail = viewer.getEmail();
            return all.stream()
                    .filter(u -> u.getId().equals(viewer.getId()) ||
                            (u.getApproverEmails() != null &&
                             u.getApproverEmails().contains(viewerEmail)))
                    .collect(Collectors.toList());
        }

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

    /** Safely parses a team string; returns null for blank/null input. */
    private static Team parseTeam(String team) {
        if (team == null || team.isBlank()) return null;
        try {
            return Team.valueOf(team.toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // ── Workday calculation ────────────────────────────────────────────────────

    private static final ZoneId SOFIA = ZoneId.of("Europe/Sofia");

    /**
     * Counts working days between {@code start} and {@code end} (inclusive).
     * Weekends and Bulgarian public holidays are excluded.
     *
     * When {@code halfDay} is true, the last date of the range contributes
     * 0.5 instead of 1.0 (provided it is itself a working day).
     */
    private double calculateWorkdays(LocalDate start, LocalDate end, boolean halfDay) {
        double count = 0;
        LocalDate current = start;
        while (!current.isAfter(end)) {
            if (isWorkday(current)) {
                boolean isLastDay = current.equals(end);
                count += (halfDay && isLastDay) ? 0.5 : 1.0;
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

    // ── Slot-aware conflict detection ──────────────────────────────────────────

    /**
     * Returns true if the proposed new request (newStart…newEnd, newSlot) conflicts
     * with an existing request.
     *
     * Conflict resolution rules:
     * – If date ranges don't overlap at all → no conflict.
     * – For each overlapping calendar day, we derive which time slots each request
     *   occupies.  A request's halfDaySlot (MORNING or AFTERNOON) applies ONLY to
     *   the LAST date of its range; all earlier dates are treated as full days.
     *   Null / NONE → full day (both MORNING and AFTERNOON).
     * – If the two requests share at least one slot on any overlapping day → conflict.
     *
     * This allows, for example, an existing MORNING request on 2026-05-10 to coexist
     * with a new AFTERNOON request on the same date.
     */
    private boolean conflictsWithSlot(LeaveRequest existing,
                                       LocalDate newStart, LocalDate newEnd,
                                       HalfDaySlot newSlot) {
        // No date-range overlap at all
        if (existing.getEndDate().isBefore(newStart) || existing.getStartDate().isAfter(newEnd)) {
            return false;
        }

        HalfDaySlot existingSlot = existing.getHalfDaySlot() != null
                ? existing.getHalfDaySlot()
                : HalfDaySlot.NONE;

        // Walk the overlapping day range and check per-day slot intersection
        LocalDate overlapStart = existing.getStartDate().isAfter(newStart)
                ? existing.getStartDate() : newStart;
        LocalDate overlapEnd   = existing.getEndDate().isBefore(newEnd)
                ? existing.getEndDate() : newEnd;

        LocalDate current = overlapStart;
        while (!current.isAfter(overlapEnd)) {
            Set<String> eSl = slotsForDay(existing.getEndDate(), existingSlot, current);
            Set<String> nSl = slotsForDay(newEnd, newSlot, current);
            // Intersection check — any shared slot is a conflict
            for (String s : eSl) {
                if (nSl.contains(s)) return true;
            }
            current = current.plusDays(1);
        }
        return false;
    }

    /**
     * Returns the set of time slots {"MORNING", "AFTERNOON"} that a request
     * occupies on a specific {@code day}.
     *
     * The halfDaySlot only applies to the LAST day of the range; all other days
     * are treated as full-day (both slots).  NONE / null → full day.
     */
    private static Set<String> slotsForDay(LocalDate rangeEnd, HalfDaySlot slot, LocalDate day) {
        if (slot == null || slot == HalfDaySlot.NONE) {
            return Set.of("MORNING", "AFTERNOON");
        }
        // Slot restriction applies only to the last day of the range
        if (day.equals(rangeEnd)) {
            return Set.of(slot.name());
        }
        return Set.of("MORNING", "AFTERNOON");
    }

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("d MMM yyyy");

    private void notifyManagersOfNewRequest(LeaveRequest request, User employee) {
        List<String> approverEmails = request.getApproverEmails();
        if (approverEmails == null || approverEmails.isEmpty()) return;
        String subject = employee.getName() + " has submitted a leave request";
        String body    = buildNewRequestBody(request, employee);
        String replyTo = employee.getEmail();
        for (String to : approverEmails) {
            emailService.sendHtmlEmail(to, subject, body, replyTo);
        }
    }

    private void notifyEmployeeOfDecision(LeaveRequest request, User employee,
                                          LeaveStatus decision, String rejectionReason,
                                          String actorId) {
        String employeeEmail = employee.getEmail();
        if (employeeEmail == null || employeeEmail.isBlank()) return;
        String replyTo  = userRepository.findById(actorId).map(User::getEmail).orElse(null);
        boolean approved = decision == LeaveStatus.APPROVED;
        String subject  = approved ? "Your leave request has been approved"
                                   : "Your leave request has been rejected";
        emailService.sendHtmlEmail(employeeEmail, subject,
                buildDecisionBody(request, approved, rejectionReason), replyTo);
    }

    private static String buildNewRequestBody(LeaveRequest r, User employee) {
        String dates = r.getStartDate().equals(r.getEndDate())
                ? r.getStartDate().format(DATE_FMT)
                : r.getStartDate().format(DATE_FMT) + " – " + r.getEndDate().format(DATE_FMT);
        return "<p>" + employee.getName() + " has submitted a leave request:</p>" +
               "<ul>" +
               "<li><b>Type:</b> " + r.getType() + "</li>" +
               "<li><b>Dates:</b> " + dates + "</li>" +
               "<li><b>Days:</b> " + r.getTotalDays() + "</li>" +
               "</ul>" +
               "<p>Please log in to review and approve or reject the request.</p>";
    }

    private static String buildDecisionBody(LeaveRequest r, boolean approved, String rejectionReason) {
        String dates = r.getStartDate().equals(r.getEndDate())
                ? r.getStartDate().format(DATE_FMT)
                : r.getStartDate().format(DATE_FMT) + " – " + r.getEndDate().format(DATE_FMT);
        StringBuilder sb = new StringBuilder();
        sb.append("<p>Your leave request has been <b>")
          .append(approved ? "approved" : "rejected")
          .append("</b>:</p>")
          .append("<ul>")
          .append("<li><b>Type:</b> ").append(r.getType()).append("</li>")
          .append("<li><b>Dates:</b> ").append(dates).append("</li>")
          .append("<li><b>Days:</b> ").append(r.getTotalDays()).append("</li>")
          .append("</ul>");
        if (!approved && rejectionReason != null && !rejectionReason.isBlank()) {
            sb.append("<p><b>Reason:</b> ").append(rejectionReason).append("</p>");
        }
        return sb.toString();
    }

    private static String currentActorId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) return "system";
        return auth.getPrincipal().toString();
    }
}
