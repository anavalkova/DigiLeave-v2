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
    private static final String DASHBOARD_URL = "https://digileave-493111.web.app";

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String senderAddress;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    @Async
    public void sendStatusNotification(String to, String employeeName,
                                       LocalDate startDate, LocalDate endDate,
                                       double totalDays, String leaveType,
                                       LeaveStatus status, String rejectionReason,
                                       String replyTo) {
        if (senderAddress == null || senderAddress.isBlank()) {
            log.warn("SMTP not configured (SPRING_MAIL_USERNAME is unset) — skipping notification to {}", to);
            return;
        }

        String subject = switch (status) {
            case APPROVED -> "Your leave request has been approved";
            case REJECTED -> "Your leave request has been rejected";
            default       -> "Your leave request status has been updated";
        };

        String htmlBody = buildStatusBody(employeeName, startDate, endDate,
                                          totalDays, leaveType, status, rejectionReason);
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

    @Async
    public void sendHtmlEmail(String to, String subject, String htmlBody, String replyTo) {
        if (senderAddress == null || senderAddress.isBlank()) {
            log.warn("SMTP not configured (SPRING_MAIL_USERNAME is unset) — skipping email to {}", to);
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

    // ── Template ──────────────────────────────────────────────────────────────

    private static String buildStatusBody(String employeeName,
                                          LocalDate startDate, LocalDate endDate,
                                          double totalDays, String leaveType,
                                          LeaveStatus status, String rejectionReason) {
        String dates = startDate.equals(endDate)
                ? startDate.format(DATE_FMT)
                : startDate.format(DATE_FMT) + " – " + endDate.format(DATE_FMT);

        String badgeBg, badgeText, badgeLabel;
        switch (status) {
            case APPROVED -> { badgeBg = "#e6f4ea"; badgeText = "#137333"; badgeLabel = "Approved"; }
            case REJECTED -> { badgeBg = "#fce8e6"; badgeText = "#c5221f"; badgeLabel = "Rejected"; }
            default       -> { badgeBg = "#e8f0fe"; badgeText = "#1a56db"; badgeLabel = "Pending";  }
        }

        String daysDisplay = totalDays == Math.floor(totalDays)
                ? String.valueOf((int) totalDays)
                : String.valueOf(totalDays);

        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html>")
          .append("<html lang=\"en\"><head>")
          .append("<meta charset=\"UTF-8\">")
          .append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">")
          .append("</head>")
          .append("<body style=\"margin:0;padding:0;background-color:#f1f3f4;")
          .append("font-family:Arial,Helvetica,sans-serif\">")

          // Outer wrapper
          .append("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"")
          .append(" style=\"background-color:#f1f3f4;padding:32px 16px\">")
          .append("<tr><td align=\"center\">")

          // Card
          .append("<table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"")
          .append(" style=\"background:#ffffff;border-radius:8px;")
          .append("box-shadow:0 1px 4px rgba(0,0,0,0.12);overflow:hidden\">")

          // ── Header ──────────────────────────────────────────────────────────
          .append("<tr>")
          .append("<td style=\"background-color:#1a56db;padding:24px 32px\">")
          .append("<table cellpadding=\"0\" cellspacing=\"0\" border=\"0\"><tr>")
          .append("<td style=\"color:#ffffff;font-size:20px;font-weight:700;")
          .append("letter-spacing:-0.3px\">Digileave</td>")
          .append("<td style=\"color:#93c5fd;font-size:13px;padding-left:12px;")
          .append("vertical-align:bottom;padding-bottom:2px\">Notification</td>")
          .append("</tr></table>")
          .append("</td>")
          .append("</tr>")

          // ── Body ─────────────────────────────────────────────────────────────
          .append("<tr><td style=\"padding:32px 32px 24px\">")

          // Greeting
          .append("<p style=\"margin:0 0 8px;font-size:16px;color:#202124\">")
          .append("Dear ").append(employeeName).append(",</p>")
          .append("<p style=\"margin:0 0 24px;font-size:15px;color:#5f6368\">")
          .append("Your leave request status has been updated.</p>")

          // Status badge
          .append("<div style=\"margin-bottom:24px\">")
          .append("<span style=\"display:inline-block;padding:6px 18px;border-radius:20px;")
          .append("font-size:13px;font-weight:700;background-color:").append(badgeBg)
          .append(";color:").append(badgeText).append("\">")
          .append("&#9679;&nbsp;").append(badgeLabel)
          .append("</span></div>")

          // Details table
          .append("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"")
          .append(" style=\"border:1px solid #e0e0e0;border-radius:6px;")
          .append("border-collapse:separate;border-spacing:0;overflow:hidden\">")
          .append(detailRow("Leave Type", leaveType,   "#f8f9fa"))
          .append(detailRow("Dates",      dates,       "#ffffff"))
          .append(detailRow("Total Days", daysDisplay, "#f8f9fa"))
          .append("</table>");

        // Rejection reason block
        if (status == LeaveStatus.REJECTED && rejectionReason != null && !rejectionReason.isBlank()) {
            sb.append("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\"")
              .append(" style=\"margin-top:20px;border-left:4px solid #c5221f;")
              .append("background-color:#fce8e6;border-radius:0 4px 4px 0\">")
              .append("<tr><td style=\"padding:12px 16px\">")
              .append("<p style=\"margin:0 0 4px;font-size:12px;font-weight:700;")
              .append("color:#c5221f;text-transform:uppercase;letter-spacing:0.5px\">Reason</p>")
              .append("<p style=\"margin:0;font-size:14px;color:#3c0a0a\">")
              .append(rejectionReason).append("</p>")
              .append("</td></tr></table>");
        }

        sb.append("</td></tr>")

          // ── CTA Button ───────────────────────────────────────────────────────
          .append("<tr><td style=\"padding:0 32px 36px;text-align:center\">")
          .append("<a href=\"").append(DASHBOARD_URL).append("\"")
          .append(" style=\"display:inline-block;padding:12px 32px;")
          .append("background-color:#1a56db;color:#ffffff;text-decoration:none;")
          .append("border-radius:4px;font-size:14px;font-weight:600;")
          .append("font-family:Arial,Helvetica,sans-serif\">")
          .append("View in Dashboard</a>")
          .append("</td></tr>")

          // ── Footer ───────────────────────────────────────────────────────────
          .append("<tr><td style=\"background-color:#f8f9fa;border-top:1px solid #e0e0e0;")
          .append("padding:16px 32px\">")
          .append("<p style=\"margin:0;font-size:12px;color:#9aa0a6;text-align:center\">")
          .append("This is an automated notification from Digileave. ")
          .append("Please do not reply to this email.</p>")
          .append("</td></tr>")

          .append("</table>") // card
          .append("</td></tr></table>") // outer wrapper
          .append("</body></html>");

        return sb.toString();
    }

    private static String detailRow(String label, String value, String bg) {
        return "<tr style=\"background-color:" + bg + "\">"
             + "<td style=\"padding:11px 16px;font-size:13px;font-weight:700;"
             + "color:#5f6368;width:36%;border-bottom:1px solid #e0e0e0\">"
             + label + "</td>"
             + "<td style=\"padding:11px 16px;font-size:13px;color:#202124;"
             + "border-bottom:1px solid #e0e0e0\">"
             + value + "</td>"
             + "</tr>";
    }
}
