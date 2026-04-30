package com.digileave.api.service;

import com.digileave.api.model.AnnualLeaveBalance;
import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Integration test: verifies that LeaveService calls EmailService correctly
 * through Spring's DI container. EmailService is @MockBean so no SMTP connection
 * is made; all repositories are also @MockBean so no MongoDB connection is needed.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@TestPropertySource(properties = {
    "spring.data.mongodb.uri=mongodb://localhost:27017/digileave-test",
    "spring.mail.host=smtp.example.com",
    "spring.mail.username=test@example.com",
    "spring.mail.password=test-password",
    "jwt.secret=test-secret-value-minimum-32-characters!!",
    "google.client-id=test-google-client-id",
    "cors.allowed-origins=http://localhost:5173"
})
class LeaveServiceEmailIntegrationTest {

    @MockBean private LeaveRequestRepository leaveRequestRepository;
    @MockBean private UserRepository         userRepository;
    @MockBean private AuditLogService        auditLogService;
    @MockBean private EmailService           emailService;

    @Autowired private LeaveService leaveService;

    private static final String    REQUEST_ID = "req-integration-1";
    private static final String    USER_ID    = "user-integration-1";
    private static final String    USER_EMAIL = "jane.smith@example.com";
    private static final LocalDate START      = LocalDate.of(2026, 7, 1);
    private static final LocalDate END        = LocalDate.of(2026, 7, 3);
    private static final double    DAYS       = 3.0;
    private static final String    TYPE       = "annual";

    private LeaveRequest pendingRequest;
    private User         employee;

    @BeforeEach
    void setUp() {
        pendingRequest = new LeaveRequest();
        pendingRequest.setId(REQUEST_ID);
        pendingRequest.setUserId(USER_ID);
        pendingRequest.setType(TYPE);
        pendingRequest.setStatus(LeaveStatus.PENDING);
        pendingRequest.setStartDate(START);
        pendingRequest.setEndDate(END);
        pendingRequest.setTotalDays(DAYS);

        employee = new User();
        employee.setId(USER_ID);
        employee.setName("Jane Smith");
        employee.setEmail(USER_EMAIL);
        AnnualLeaveBalance bal = new AnnualLeaveBalance();
        bal.setEntitled(20);
        employee.setAnnualLeave(bal);

        when(leaveRequestRepository.findById(REQUEST_ID))
                .thenReturn(Optional.of(pendingRequest));
        when(userRepository.findById(USER_ID))
                .thenReturn(Optional.of(employee));
        // syncUsed() re-queries approved leave after every status change
        when(leaveRequestRepository.findByUserIdAndStatus(USER_ID, LeaveStatus.APPROVED))
                .thenReturn(List.of());
        when(leaveRequestRepository.save(any()))
                .thenAnswer(inv -> inv.getArgument(0));
        when(userRepository.save(any()))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    // ── Requirement 1: notification is triggered exactly once ─────────────────

    @Nested
    class NotificationTriggered {

        @Test
        void approveRequest_callsSendStatusNotificationExactlyOnce() {
            leaveService.approveRequest(REQUEST_ID);

            verify(emailService, times(1)).sendStatusNotification(
                    eq(USER_EMAIL),
                    eq(employee.getName()),
                    eq(START),
                    eq(END),
                    eq(DAYS),
                    eq(TYPE),
                    eq(LeaveStatus.APPROVED),
                    isNull(),         // no rejection reason for approvals
                    any()             // replyTo — resolved from actorId at runtime
            );
        }

        @Test
        void rejectRequest_callsSendStatusNotificationExactlyOnce() {
            String reason = "Team at full capacity that week";

            leaveService.rejectRequest(REQUEST_ID, reason);

            verify(emailService, times(1)).sendStatusNotification(
                    eq(USER_EMAIL),
                    anyString(),
                    any(), any(),
                    anyDouble(),
                    anyString(),
                    eq(LeaveStatus.REJECTED),
                    eq(reason),
                    any()
            );
        }
    }

    // ── Requirement 2: correct data is passed to the notification ─────────────

    @Nested
    class CorrectDataPassed {

        @Test
        void approveRequest_passesRecipientEmailFromEmployee() {
            ArgumentCaptor<String> toCaptor = ArgumentCaptor.forClass(String.class);

            leaveService.approveRequest(REQUEST_ID);

            verify(emailService).sendStatusNotification(
                    toCaptor.capture(), any(), any(), any(),
                    anyDouble(), any(), any(), any(), any());

            assertThat(toCaptor.getValue()).isEqualTo(USER_EMAIL);
        }

        @Test
        void approveRequest_passesDatesAndStatusFromLeaveRequest() {
            ArgumentCaptor<LocalDate>   startCaptor  = ArgumentCaptor.forClass(LocalDate.class);
            ArgumentCaptor<LocalDate>   endCaptor    = ArgumentCaptor.forClass(LocalDate.class);
            ArgumentCaptor<Double>      daysCaptor   = ArgumentCaptor.forClass(Double.class);
            ArgumentCaptor<LeaveStatus> statusCaptor = ArgumentCaptor.forClass(LeaveStatus.class);

            leaveService.approveRequest(REQUEST_ID);

            verify(emailService).sendStatusNotification(
                    any(), any(),
                    startCaptor.capture(), endCaptor.capture(),
                    daysCaptor.capture(), any(),
                    statusCaptor.capture(), any(), any());

            assertThat(startCaptor.getValue()).isEqualTo(START);
            assertThat(endCaptor.getValue()).isEqualTo(END);
            assertThat(daysCaptor.getValue()).isEqualTo(DAYS);
            assertThat(statusCaptor.getValue()).isEqualTo(LeaveStatus.APPROVED);
        }

        @Test
        void rejectRequest_passesRejectionReasonVerbatim() {
            String reason = "Public holiday overlap";
            ArgumentCaptor<String> reasonCaptor = ArgumentCaptor.forClass(String.class);

            leaveService.rejectRequest(REQUEST_ID, reason);

            verify(emailService).sendStatusNotification(
                    any(), any(), any(), any(),
                    anyDouble(), any(), any(),
                    reasonCaptor.capture(), any());

            // XssUtils.sanitize() is applied but plain text passes through unchanged
            assertThat(reasonCaptor.getValue()).isEqualTo(reason);
        }
    }

    // ── Requirement 3: no email when save fails ───────────────────────────────

    @Nested
    class DatabaseFailure {

        @Test
        void saveThrows_approveRequest_emailNotificationNotSent() {
            when(leaveRequestRepository.save(any()))
                    .thenThrow(new RuntimeException("DB write failed"));

            assertThatThrownBy(() -> leaveService.approveRequest(REQUEST_ID))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("DB write failed");

            verifyNoInteractions(emailService);
        }

        @Test
        void saveThrows_rejectRequest_emailNotificationNotSent() {
            when(leaveRequestRepository.save(any()))
                    .thenThrow(new RuntimeException("DB write failed"));

            assertThatThrownBy(() -> leaveService.rejectRequest(REQUEST_ID, "any reason"))
                    .isInstanceOf(RuntimeException.class);

            verifyNoInteractions(emailService);
        }
    }
}
