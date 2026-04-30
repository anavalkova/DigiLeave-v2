package com.digileave.api.service;

import com.digileave.api.dto.LeaveRequestDto;
import com.digileave.api.exception.ValidationException;
import com.digileave.api.model.*;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class LeaveServiceTest {

    @Mock private LeaveRequestRepository leaveRequestRepository;
    @Mock private UserRepository         userRepository;
    @Mock private AuditLogService        auditLogService;
    @Mock private EmailService           emailService;

    @InjectMocks
    private LeaveService leaveService;

    private static final String USER_ID = "user-1";

    // Workdays in June 2026 — no Bulgarian public holidays, no weekends
    private static final LocalDate MON      = LocalDate.of(2026, 6, 1);
    private static final LocalDate TUE      = LocalDate.of(2026, 6, 2);
    private static final LocalDate WED      = LocalDate.of(2026, 6, 3);
    private static final LocalDate FRI      = LocalDate.of(2026, 6, 5);
    private static final LocalDate SAT      = LocalDate.of(2026, 6, 6);
    private static final LocalDate SUN      = LocalDate.of(2026, 6, 7);
    private static final LocalDate NEXT_MON = LocalDate.of(2026, 6, 8);

    // ── Helpers ───────────────────────────────────────────────────────────────

    private User makeUser(int entitled, int transferred) {
        User user = new User();
        user.setId(USER_ID);
        user.setName("Test User");
        user.setEmail("test@example.com");
        AnnualLeaveBalance bal = new AnnualLeaveBalance();
        bal.setEntitled(entitled);
        bal.setTransferred(transferred);
        user.setAnnualLeave(bal);
        return user;
    }

    private LeaveRequest makeRequest(LocalDate start, LocalDate end, double days,
                                     LeaveStatus status, HalfDaySlot slot) {
        LeaveRequest r = new LeaveRequest();
        r.setUserId(USER_ID);
        r.setStartDate(start);
        r.setEndDate(end);
        r.setType("annual");
        r.setStatus(status);
        r.setTotalDays(days);
        r.setHalfDaySlot(slot != null ? slot : HalfDaySlot.NONE);
        r.setHalfDay(slot == HalfDaySlot.MORNING || slot == HalfDaySlot.AFTERNOON);
        return r;
    }

    private LeaveRequestDto dto(LocalDate start, LocalDate end, String type, HalfDaySlot slot) {
        LeaveRequestDto d = new LeaveRequestDto();
        d.setUserId(USER_ID);
        d.setStartDate(start);
        d.setEndDate(end);
        d.setType(type);
        d.setHalfDaySlot(slot);
        return d;
    }

    @BeforeEach
    void stubDefaults() {
        // lenient: some validation-guard tests throw before these mocks are reached
        lenient().when(leaveRequestRepository.findByUserIdAndStatusIn(eq(USER_ID), anyList()))
                .thenReturn(List.of());
        lenient().when(leaveRequestRepository.findByUserIdAndStatus(eq(USER_ID), eq(LeaveStatus.APPROVED)))
                .thenReturn(List.of());
        lenient().when(leaveRequestRepository.findByUserIdAndStatus(eq(USER_ID), eq(LeaveStatus.PENDING)))
                .thenReturn(List.of());
        lenient().when(leaveRequestRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    // ── Balance deduction ─────────────────────────────────────────────────────

    @Nested
    class BalanceDeduction {

        @Test
        void annualLeave_threeDayRange_savedWithCorrectTotalDays() {
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(20, 0)));

            LeaveRequest saved = leaveService.createRequest(dto(MON, WED, "annual", HalfDaySlot.NONE));

            assertThat(saved.getTotalDays()).isEqualTo(3.0);
            assertThat(saved.getStatus()).isEqualTo(LeaveStatus.PENDING);
            verify(leaveRequestRepository).save(any(LeaveRequest.class));
        }

        @Test
        void annualLeave_approvedAndPendingDaysCountAgainstBalance() {
            // entitled=5, 2 approved + 2 pending = 4 consumed → 1 available; requesting 1 → passes
            User user = makeUser(5, 0);
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
            when(leaveRequestRepository.findByUserIdAndStatus(USER_ID, LeaveStatus.APPROVED))
                    .thenReturn(List.of(makeRequest(
                            LocalDate.of(2026, 5, 4), LocalDate.of(2026, 5, 5), 2.0,
                            LeaveStatus.APPROVED, HalfDaySlot.NONE)));
            when(leaveRequestRepository.findByUserIdAndStatus(USER_ID, LeaveStatus.PENDING))
                    .thenReturn(List.of(makeRequest(
                            LocalDate.of(2026, 5, 6), LocalDate.of(2026, 5, 7), 2.0,
                            LeaveStatus.PENDING, HalfDaySlot.NONE)));

            LeaveRequest saved = leaveService.createRequest(dto(MON, MON, "annual", HalfDaySlot.NONE));

            assertThat(saved.getTotalDays()).isEqualTo(1.0);
        }

        @Test
        void annualLeave_transferredDaysIncludedInTotalGranted() {
            // 0 entitled + 3 transferred = 3 available; requesting 3 workdays → passes
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(0, 3)));

            LeaveRequest saved = leaveService.createRequest(dto(MON, WED, "annual", HalfDaySlot.NONE));

            assertThat(saved.getTotalDays()).isEqualTo(3.0);
        }

        @Test
        void sickLeave_doesNotCheckBalance_zeroEntitledAllowed() {
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(0, 0)));

            assertThatNoException().isThrownBy(() ->
                    leaveService.createRequest(dto(MON, MON, "sick_leave", HalfDaySlot.NONE)));
        }

        @Test
        void homeOffice_doesNotCheckBalance_zeroEntitledAllowed() {
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(0, 0)));

            assertThatNoException().isThrownBy(() ->
                    leaveService.createRequest(dto(MON, MON, "home_office", HalfDaySlot.NONE)));
        }
    }

    // ── Edge cases ────────────────────────────────────────────────────────────

    @Nested
    class EdgeCases {

        @Test
        void halfDay_singleDay_deductsZeroPointFive() {
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(20, 0)));

            LeaveRequest saved = leaveService.createRequest(dto(MON, MON, "annual", HalfDaySlot.MORNING));

            assertThat(saved.getTotalDays()).isEqualTo(0.5);
            assertThat(saved.isHalfDay()).isTrue();
            assertThat(saved.getHalfDaySlot()).isEqualTo(HalfDaySlot.MORNING);
        }

        @Test
        void halfDay_multiDayRange_onlyLastDayIsHalf() {
            // Mon–Wed: Mon=1, Tue=1, Wed(last,half)=0.5 → total 2.5
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(20, 0)));

            LeaveRequest saved = leaveService.createRequest(dto(MON, WED, "annual", HalfDaySlot.AFTERNOON));

            assertThat(saved.getTotalDays()).isEqualTo(2.5);
        }

        @Test
        void spanningWeekend_weekendDaysExcluded() {
            // Fri → following Mon spans Sat+Sun → only 2 workdays counted
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(20, 0)));

            LeaveRequest saved = leaveService.createRequest(dto(FRI, NEXT_MON, "annual", HalfDaySlot.NONE));

            assertThat(saved.getTotalDays()).isEqualTo(2.0);
        }

        @Test
        void complementaryHalfDays_morningAndAfternoonOnSameDay_doNotConflict() {
            // Existing MORNING slot on MON; new AFTERNOON request on same day → no overlap
            LeaveRequest existing = makeRequest(MON, MON, 0.5, LeaveStatus.APPROVED, HalfDaySlot.MORNING);
            when(leaveRequestRepository.findByUserIdAndStatusIn(eq(USER_ID), anyList()))
                    .thenReturn(List.of(existing));
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(20, 0)));

            LeaveRequest saved = leaveService.createRequest(dto(MON, MON, "annual", HalfDaySlot.AFTERNOON));

            assertThat(saved.getTotalDays()).isEqualTo(0.5);
            assertThat(saved.getHalfDaySlot()).isEqualTo(HalfDaySlot.AFTERNOON);
        }

        @Test
        void allWeekendRange_throwsValidationException() {
            // Sat–Sun → 0 working days
            assertThatThrownBy(() -> leaveService.createRequest(dto(SAT, SUN, "annual", HalfDaySlot.NONE)))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("no working days");
        }

        @Test
        void exceedsAvailableBalance_throwsValidationException() {
            // entitled=2, requesting 3 days (Mon–Wed)
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(makeUser(2, 0)));

            assertThatThrownBy(() -> leaveService.createRequest(dto(MON, WED, "annual", HalfDaySlot.NONE)))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("exceeds your available leave balance");
        }

        @Test
        void pendingDaysReduceAvailableBalance_requestPushesOverLimit_throwsValidationException() {
            // entitled=5, pending=4 → only 1 available; requesting 2 days (Mon–Tue) → fails
            User user = makeUser(5, 0);
            when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
            when(leaveRequestRepository.findByUserIdAndStatus(USER_ID, LeaveStatus.PENDING))
                    .thenReturn(List.of(makeRequest(
                            LocalDate.of(2026, 5, 4), LocalDate.of(2026, 5, 7), 4.0,
                            LeaveStatus.PENDING, HalfDaySlot.NONE)));

            assertThatThrownBy(() -> leaveService.createRequest(dto(MON, TUE, "annual", HalfDaySlot.NONE)))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("pending count against your balance");
        }

        @Test
        void overlappingFullDayRequest_throwsValidationException() {
            // Existing approved full-day on MON; new request also on MON → conflict
            LeaveRequest existing = makeRequest(MON, MON, 1.0, LeaveStatus.APPROVED, HalfDaySlot.NONE);
            when(leaveRequestRepository.findByUserIdAndStatusIn(eq(USER_ID), anyList()))
                    .thenReturn(List.of(existing));

            assertThatThrownBy(() -> leaveService.createRequest(dto(MON, MON, "annual", HalfDaySlot.NONE)))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("overlaps");
        }

        @Test
        void sameHalfDaySlotOnSameDay_throwsValidationException() {
            // Two MORNING requests on the same day → conflict
            LeaveRequest existing = makeRequest(MON, MON, 0.5, LeaveStatus.PENDING, HalfDaySlot.MORNING);
            when(leaveRequestRepository.findByUserIdAndStatusIn(eq(USER_ID), anyList()))
                    .thenReturn(List.of(existing));

            assertThatThrownBy(() -> leaveService.createRequest(dto(MON, MON, "annual", HalfDaySlot.MORNING)))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("overlaps");
        }
    }

    // ── Validation guards ─────────────────────────────────────────────────────

    @Nested
    class ValidationGuards {

        @Test
        void nullUserId_throwsValidationException() {
            LeaveRequestDto d = dto(MON, MON, "annual", HalfDaySlot.NONE);
            d.setUserId(null);

            assertThatThrownBy(() -> leaveService.createRequest(d))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("not authenticated");
        }

        @Test
        void blankUserId_throwsValidationException() {
            LeaveRequestDto d = dto(MON, MON, "annual", HalfDaySlot.NONE);
            d.setUserId("   ");

            assertThatThrownBy(() -> leaveService.createRequest(d))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("not authenticated");
        }

        @Test
        void pastStartDate_throwsValidationException() {
            LeaveRequestDto d = dto(LocalDate.now().minusDays(1), LocalDate.now().plusDays(1),
                    "annual", HalfDaySlot.NONE);

            assertThatThrownBy(() -> leaveService.createRequest(d))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("past");
        }

        @Test
        void endDateBeforeStartDate_throwsValidationException() {
            // start=WED (Jun 3), end=MON (Jun 1) → end before start
            LeaveRequestDto d = dto(WED, MON, "annual", HalfDaySlot.NONE);

            assertThatThrownBy(() -> leaveService.createRequest(d))
                    .isInstanceOf(ValidationException.class)
                    .hasMessageContaining("End date cannot be before start date");
        }

        @Test
        void userNotFound_throwsIllegalArgumentException() {
            when(userRepository.findById(USER_ID)).thenReturn(Optional.empty());

            // sick_leave skips balance check but still looks up the user
            assertThatThrownBy(() -> leaveService.createRequest(dto(MON, MON, "sick_leave", HalfDaySlot.NONE)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("User not found");
        }

        @Test
        void noRepositoryCallsMadeForBlankUserId() {
            LeaveRequestDto d = dto(MON, MON, "annual", HalfDaySlot.NONE);
            d.setUserId("");

            assertThatThrownBy(() -> leaveService.createRequest(d))
                    .isInstanceOf(ValidationException.class);

            verifyNoInteractions(leaveRequestRepository, userRepository);
        }
    }
}
