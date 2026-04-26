package com.digileave.api.service;

import com.digileave.api.dto.CalendarEventDto;
import com.digileave.api.dto.LeaveRequestDto;
import com.digileave.api.dto.LeaveSummaryDto;
import com.digileave.api.dto.PendingRequestDto;
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
    private final UserRepository         userRepository;

    public LeaveService(LeaveRequestRepository leaveRequestRepository,
                        UserRepository userRepository) {
        this.leaveRequestRepository = leaveRequestRepository;
        this.userRepository         = userRepository;
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

    public LeaveRequest createRequest(LeaveRequestDto dto) {
        if (dto.getUserId() == null || dto.getUserId().isBlank()) {
            throw new IllegalArgumentException("User is not authenticated.");
        }

        LocalDate startDate = dto.getStartDate();
        LocalDate endDate   = dto.getEndDate();

        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("Start date and end date are required.");
        }

        // 1. Past-date guard
        if (startDate.isBefore(LocalDate.now())) {
            throw new IllegalArgumentException(
                    "Leave requests cannot be submitted for dates in the past.");
        }

        // 2. Date-order sanity
        if (endDate.isBefore(startDate)) {
            throw new IllegalArgumentException("End date cannot be before start date.");
        }

        // 3. Slot-aware overlap check (PENDING or APPROVED requests)
        HalfDaySlot newSlot = dto.getHalfDaySlot() != null ? dto.getHalfDaySlot() : HalfDaySlot.NONE;

        List<LeaveRequest> active = leaveRequestRepository.findByUserIdAndStatusIn(
                dto.getUserId(), List.of(LeaveStatus.PENDING, LeaveStatus.APPROVED));

        boolean overlaps = active.stream()
                .anyMatch(existing -> conflictsWithSlot(existing, startDate, endDate, newSlot));

        if (overlaps) {
            throw new IllegalArgumentException(
                    "You already have a leave request that overlaps with these dates and time slot.");
        }

        // 4. Workday count — half-day on last date subtracts 0.5
        double totalDays = calculateWorkdays(startDate, endDate, dto.isHalfDay());

        if (totalDays <= 0) {
            throw new IllegalArgumentException(
                    "The selected date range contains no working days " +
                    "(all days are weekends or public holidays).");
        }

        // 5. Balance check — only for annual leave (Point 3: strict balance isolation)
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

            // Available = total granted − already committed
            double totalGranted  = bal.getEntitled() + bal.getTransferred() + bal.getStartingBalanceAdjustment();
            double availableDays = totalGranted - approvedDays - pendingDays;

            if (totalDays > availableDays) {
                throw new IllegalArgumentException(
                        "Request exceeds your available leave balance of " + availableDays + " day(s)." +
                        " Note: days already pending count against your balance.");
            }
        }

        // 6. Save
        LeaveRequest request = new LeaveRequest();
        request.setUserId(dto.getUserId());
        request.setStartDate(startDate);
        request.setEndDate(endDate);
        request.setType(dto.getType());
        request.setStatus(LeaveStatus.PENDING);
        request.setTotalDays(totalDays);
        request.setHalfDay(dto.isHalfDay());
        request.setHalfDaySlot(newSlot);
        request.setRequestDate(LocalDate.now());
        request.setApproverEmails(user.getApproverEmails());
        return leaveRequestRepository.save(request);
    }

    public List<LeaveRequest> getRequestsByUser(String userId) {
        return leaveRequestRepository.findByUserId(userId);
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

        request.setStatus(LeaveStatus.APPROVED);
        LeaveRequest saved = leaveRequestRepository.save(request);

        // HOME_OFFICE, SICK_LEAVE, UNPAID_LEAVE — do NOT call syncUsed (Point 3)
        if (affectsBalance(request.getType())) {
            syncUsed(user);
        }

        return saved;
    }

    /**
     * Cancels a leave request owned by requestingUserId.
     * If the request was APPROVED the ledger is recalculated.
     * Point 4 — user self-cancellation: any user may cancel their own PENDING requests.
     */
    public LeaveRequest cancelRequest(String requestId, String requestingUserId) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        if (!requestingUserId.equals(request.getUserId())) {
            throw new IllegalArgumentException("You can only cancel your own requests.");
        }

        if (request.getStartDate().isBefore(LocalDate.now(SOFIA))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Cannot cancel a request whose start date has already passed.");
        }

        LeaveStatus current = request.getStatus();
        if (current == LeaveStatus.CANCELLED) return request;
        if (current == LeaveStatus.REJECTED) {
            throw new IllegalArgumentException("Rejected requests cannot be cancelled.");
        }

        boolean wasApproved = current == LeaveStatus.APPROVED;
        request.setStatus(LeaveStatus.CANCELLED);
        LeaveRequest saved = leaveRequestRepository.save(request);

        if (wasApproved && affectsBalance(request.getType())) {
            userRepository.findById(request.getUserId()).ifPresent(this::syncUsed);
        }

        return saved;
    }

    /**
     * Rejects a leave request.
     * If the request was previously APPROVED the ledger is recalculated.
     */
    public LeaveRequest rejectRequest(String requestId) {
        LeaveRequest request = leaveRequestRepository.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Leave request not found."));

        if (request.getStatus() == LeaveStatus.REJECTED) return request;

        boolean wasApproved = request.getStatus() == LeaveStatus.APPROVED;
        request.setStatus(LeaveStatus.REJECTED);
        LeaveRequest saved = leaveRequestRepository.save(request);

        if (wasApproved && request.getUserId() != null && affectsBalance(request.getType())) {
            userRepository.findById(request.getUserId()).ifPresent(this::syncUsed);
        }

        return saved;
    }

    // ── Approvals / calendar views ────────────────────────────────────────────

    /**
     * Returns pending requests visible to the caller.
     *
     * @param currentUserId  the caller's user ID
     * @param team           optional team filter (OPR / DEV); null means all teams
     */
    public List<PendingRequestDto> getPendingRequests(String currentUserId, String team) {
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

        // Build a user map for name/email lookups (and team filtering)
        Map<String, User> userMap = userRepository.findAll().stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        // Optional team filter
        Team teamFilter = parseTeam(team);

        return requests.stream()
                .filter(req -> {
                    if (teamFilter == null || req.getUserId() == null) return true;
                    User submitter = userMap.get(req.getUserId());
                    return submitter != null && teamFilter.equals(submitter.getTeam());
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
}
