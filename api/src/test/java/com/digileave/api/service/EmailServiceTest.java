package com.digileave.api.service;

import com.digileave.api.model.LeaveStatus;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EmailServiceTest {

    @Mock  private JavaMailSender mailSender;
    @InjectMocks private EmailService emailService;

    private static final String     TO    = "employee@example.com";
    private static final String     NAME  = "Jane Smith";
    private static final LocalDate  START = LocalDate.of(2026, 6, 1);
    private static final LocalDate  END   = LocalDate.of(2026, 6, 3);
    private static final double     DAYS  = 3.0;
    private static final String     TYPE  = "Annual Leave";

    private MimeMessage mimeMessage;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(emailService, "senderAddress", "noreply@digileave.com");
        mimeMessage = new MimeMessage(Session.getDefaultInstance(new Properties()));
        // lenient: the blankSenderAddress test returns early before createMimeMessage() is reached
        lenient().when(mailSender.createMimeMessage()).thenReturn(mimeMessage);
    }

    // ── Approved ──────────────────────────────────────────────────────────────

    @Nested
    class Approved {

        @Test
        void setsCorrectRecipient() throws Exception {
            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.APPROVED, null, null);

            assertThat(mimeMessage.getAllRecipients()).hasSize(1);
            assertThat(mimeMessage.getAllRecipients()[0].toString()).isEqualTo(TO);
        }

        @Test
        void htmlBodyContainsApprovedBadge() throws Exception {
            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.APPROVED, null, null);

            assertThat(mimeMessage.getContent().toString()).containsIgnoringCase("approved");
        }

        @Test
        void htmlBodyContainsEmployeeName() throws Exception {
            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.APPROVED, null, null);

            assertThat(mimeMessage.getContent().toString()).contains(NAME);
        }

        @Test
        void invokesMailSenderSend() {
            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.APPROVED, null, null);

            verify(mailSender).send(any(MimeMessage.class));
        }
    }

    // ── Rejected ─────────────────────────────────────────────────────────────

    @Nested
    class Rejected {

        @Test
        void htmlBodyContainsRejectedBadge() throws Exception {
            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.REJECTED, null, null);

            assertThat(mimeMessage.getContent().toString()).containsIgnoringCase("rejected");
        }

        @Test
        void htmlBodyContainsRejectionReason_whenProvided() throws Exception {
            String reason = "Insufficient team coverage during the holiday period";

            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.REJECTED, reason, null);

            assertThat(mimeMessage.getContent().toString()).contains(reason);
        }

        @Test
        void htmlBodyOmitsReasonBlock_whenReasonIsNull() throws Exception {
            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.REJECTED, null, null);

            // "Reason" label is only rendered when a reason string is present
            assertThat(mimeMessage.getContent().toString()).doesNotContain("Reason");
        }

        @Test
        void htmlBodyOmitsReasonBlock_whenReasonIsBlank() throws Exception {
            emailService.sendStatusNotification(
                    TO, NAME, START, END, DAYS, TYPE, LeaveStatus.REJECTED, "   ", null);

            assertThat(mimeMessage.getContent().toString()).doesNotContain("Reason");
        }
    }

    // ── Error resilience ──────────────────────────────────────────────────────

    @Nested
    class ErrorResilience {

        @Test
        void mailSendException_doesNotPropagateToCaller() {
            doThrow(new MailSendException("SMTP connection timed out"))
                    .when(mailSender).send(any(MimeMessage.class));

            assertThatNoException().isThrownBy(() ->
                    emailService.sendStatusNotification(
                            TO, NAME, START, END, DAYS, TYPE, LeaveStatus.APPROVED, null, null));
        }

        @Test
        void blankSenderAddress_skipsDeliveryWithoutThrowing() {
            ReflectionTestUtils.setField(emailService, "senderAddress", "");

            assertThatNoException().isThrownBy(() ->
                    emailService.sendStatusNotification(
                            TO, NAME, START, END, DAYS, TYPE, LeaveStatus.APPROVED, null, null));

            verify(mailSender, never()).send(any(MimeMessage.class));
        }

        @Test
        void nullSenderAddress_skipsDeliveryWithoutThrowing() {
            ReflectionTestUtils.setField(emailService, "senderAddress", null);

            assertThatNoException().isThrownBy(() ->
                    emailService.sendStatusNotification(
                            TO, NAME, START, END, DAYS, TYPE, LeaveStatus.APPROVED, null, null));

            verify(mailSender, never()).send(any(MimeMessage.class));
        }
    }
}
