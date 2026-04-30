package com.digileave.api.service;

import com.digileave.api.model.LeaveStatus;
import jakarta.mail.MessagingException;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("d MMM yyyy");

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String senderAddress;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    /**
     * Sends an HTML status notification to an employee after their leave request
     * is approved or rejected. Failures are logged but not propagated.
     */
    @Async
    public void sendStatusNotification(String to, String employeeName,
                                       LocalDate startDate, LocalDate endDate,
                                       double totalDays, String leaveType,
                                       LeaveStatus status, String rejectionReason,
                                       String replyTo) {
        if (senderAddress == null || senderAddress.isBlank()) {
            log.warn("SMTP not configured (SMTP_USERNAME is unset) — skipping status notification to {}", to);
            return;
        }
        boolean approved = status == LeaveStatus.APPROVED;
        String subject   = approved ? "Your leave request has been approved"
                                    : "Your leave request has been rejected";
        String htmlBody  = buildStatusBody(employeeName, startDate, endDate,
                                           totalDays, leaveType, approved, rejectionReason);
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(senderAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            if (replyTo != null && !replyTo.isBlank()) {
                helper.setReplyTo(replyTo);
            }
            mailSender.send(message);
            log.info("Status notification sent to {}: {}", to, subject);
        } catch (MessagingException | MailException e) {
            log.error("Failed to send status notification to {}: {}", to, e.getMessage(), e);
        }
    }

    /**
     * Sends an HTML email asynchronously.
     * Failures are logged but not propagated — callers are not blocked on delivery.
     */
    @Async
    public void sendHtmlEmail(String to, String subject, String htmlBody, String replyTo) {
        if (senderAddress == null || senderAddress.isBlank()) {
            log.warn("SMTP not configured (SMTP_USERNAME is unset) — skipping email to {}", to);
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, "UTF-8");
            helper.setFrom(senderAddress);
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            if (replyTo != null && !replyTo.isBlank()) {
                helper.setReplyTo(replyTo);
            }
            mailSender.send(message);
            log.info("Email sent to {}: {}", to, subject);
        } catch (MessagingException | MailException e) {
            log.error("Failed to send email to {}: {}", to, e.getMessage(), e);
        }
    }

    private static String buildStatusBody(String employeeName,
                                          LocalDate startDate, LocalDate endDate,
                                          double totalDays, String leaveType,
                                          boolean approved, String rejectionReason) {
        String statusLabel = approved ? "approved" : "rejected";
        String accentColor = approved ? "#2e7d32" : "#c62828";
        String dates = startDate.equals(endDate)
                ? startDate.format(DATE_FMT)
                : startDate.format(DATE_FMT) + " – " + endDate.format(DATE_FMT);

        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head>")
          .append("<body style=\"font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:24px\">")
          .append("<h2 style=\"color:").append(accentColor).append("\">")
          .append("Leave request ").append(statusLabel)
          .append("</h2>")
          .append("<p>Dear ").append(employeeName).append(",</p>")
          .append("<p>Your leave request has been <strong style=\"color:").append(accentColor).append("\">")
          .append(statusLabel).append("</strong>.</p>")
          .append("<table style=\"border-collapse:collapse;width:100%;margin:16px 0\">")
          .append(row("Type",  leaveType))
          .append(row("Dates", dates))
          .append(row("Days",  String.valueOf(totalDays)))
          .append("</table>");

        if (!approved && rejectionReason != null && !rejectionReason.isBlank()) {
            sb.append("<p><strong>Reason:</strong> ").append(rejectionReason).append("</p>");
        }

        sb.append("<p style=\"color:#666;font-size:13px;margin-top:32px\">")
          .append("This is an automated notification from Digileave.")
          .append("</p>")
          .append("</body></html>");
        return sb.toString();
    }

    private static String row(String label, String value) {
        return "<tr>"
             + "<td style=\"padding:8px 12px;border:1px solid #e0e0e0;background:#f5f5f5;"
             + "font-weight:bold;width:30%\">" + label + "</td>"
             + "<td style=\"padding:8px 12px;border:1px solid #e0e0e0\">" + value + "</td>"
             + "</tr>";
    }
}
