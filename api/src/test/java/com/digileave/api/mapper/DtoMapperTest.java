package com.digileave.api.mapper;

import com.digileave.api.dto.AuditLogResponseDto;
import com.digileave.api.dto.LeaveRequestResponseDto;
import com.digileave.api.dto.UserResponseDto;
import com.digileave.api.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

class DtoMapperTest {

    private DtoMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = new DtoMapper();
    }

    // ── toUserResponse ────────────────────────────────────────────────────────

    @Nested
    class ToUserResponse {

        private User fullyPopulatedUser() {
            AnnualLeaveBalance bal = new AnnualLeaveBalance();
            bal.setEntitled(20);
            bal.setTransferred(3);
            bal.setStartingBalanceAdjustment(-1);
            bal.setUsed(5.0);

            User user = new User();
            user.setId("mongo-id-123");
            user.setGoogleId("google-oauth-sub-secret");
            user.setEmail("ana@example.com");
            user.setName("Ana V");
            user.setPicture("https://example.com/pic.jpg");
            user.setRole(Role.APPROVER);
            user.setTeam(Team.DEV);
            user.setAnnualLeave(bal);
            user.setApproverEmails(List.of("boss@example.com"));
            return user;
        }

        @Test
        void allPublicFields_mapCorrectly() {
            UserResponseDto dto = mapper.toUserResponse(fullyPopulatedUser());

            assertThat(dto.getId()).isEqualTo("mongo-id-123");
            assertThat(dto.getName()).isEqualTo("Ana V");
            assertThat(dto.getEmail()).isEqualTo("ana@example.com");
            assertThat(dto.getPicture()).isEqualTo("https://example.com/pic.jpg");
            assertThat(dto.getRole()).isEqualTo("APPROVER");
            assertThat(dto.getTeam()).isEqualTo("DEV");
            assertThat(dto.getApproverEmails()).containsExactly("boss@example.com");
        }

        @Test
        void annualLeaveBalance_allSubfields_mapCorrectly() {
            UserResponseDto dto = mapper.toUserResponse(fullyPopulatedUser());

            AnnualLeaveBalance bal = dto.getAnnualLeave();
            assertThat(bal).isNotNull();
            assertThat(bal.getEntitled()).isEqualTo(20);
            assertThat(bal.getTransferred()).isEqualTo(3);
            assertThat(bal.getStartingBalanceAdjustment()).isEqualTo(-1);
            assertThat(bal.getUsed()).isEqualTo(5.0);
        }

        // ── Sensitive field exclusion ─────────────────────────────────────────

        @Test
        void googleId_notDeclaredInDto() {
            boolean hasGoogleId = Arrays.stream(UserResponseDto.class.getDeclaredFields())
                    .anyMatch(f -> f.getName().equals("googleId"));
            assertThat(hasGoogleId)
                    .as("UserResponseDto must not expose googleId (Google OAuth sub)")
                    .isFalse();
        }

        @Test
        void deprecatedLegacyFields_notDeclaredInDto() {
            List<String> forbidden = List.of("entitledDays", "remainingDays", "usedDays");
            List<String> dtoFields = Arrays.stream(UserResponseDto.class.getDeclaredFields())
                    .map(java.lang.reflect.Field::getName)
                    .toList();
            assertThat(dtoFields)
                    .as("UserResponseDto must not expose deprecated balance fields")
                    .doesNotContainAnyElementsOf(forbidden);
        }

        // ── Enum → String serialisation ───────────────────────────────────────

        @Test
        void allRoleValues_mapToCorrectString() {
            User user = fullyPopulatedUser();
            for (Role role : Role.values()) {
                user.setRole(role);
                assertThat(mapper.toUserResponse(user).getRole()).isEqualTo(role.name());
            }
        }

        @Test
        void allTeamValues_mapToCorrectString() {
            User user = fullyPopulatedUser();
            for (Team team : Team.values()) {
                user.setTeam(team);
                assertThat(mapper.toUserResponse(user).getTeam()).isEqualTo(team.name());
            }
        }

        // ── Null field handling ───────────────────────────────────────────────

        @Test
        void nullRole_mapsToNull() {
            User user = fullyPopulatedUser();
            user.setRole(null);
            assertThat(mapper.toUserResponse(user).getRole()).isNull();
        }

        @Test
        void nullTeam_mapsToNull() {
            User user = fullyPopulatedUser();
            user.setTeam(null);
            assertThat(mapper.toUserResponse(user).getTeam()).isNull();
        }

        @Test
        void nullApproverEmails_mapsToEmptyList() {
            User user = fullyPopulatedUser();
            user.setApproverEmails(null);
            assertThat(mapper.toUserResponse(user).getApproverEmails())
                    .as("null approverEmails must not reach the frontend as null")
                    .isNotNull()
                    .isEmpty();
        }
    }

    // ── toLeaveRequestResponse ────────────────────────────────────────────────

    @Nested
    class ToLeaveRequestResponse {

        private LeaveRequest fullyPopulatedRequest() {
            LeaveRequest req = new LeaveRequest();
            req.setId("leave-id-99");
            req.setUserId("user-abc");
            req.setStartDate(LocalDate.of(2026, 6, 1));
            req.setEndDate(LocalDate.of(2026, 6, 5));
            req.setType("annual");
            req.setStatus(LeaveStatus.APPROVED);
            req.setTotalDays(5.0);
            req.setHalfDay(false);
            req.setHalfDaySlot(HalfDaySlot.NONE);
            req.setRequestDate(LocalDate.of(2026, 5, 20));
            req.setApproverEmails(List.of("approver@example.com"));
            req.setRejectionReason(null);
            return req;
        }

        @Test
        void allFields_mapCorrectly() {
            LeaveRequestResponseDto dto = mapper.toLeaveRequestResponse(fullyPopulatedRequest());

            assertThat(dto.getId()).isEqualTo("leave-id-99");
            assertThat(dto.getUserId()).isEqualTo("user-abc");
            assertThat(dto.getStartDate()).isEqualTo(LocalDate.of(2026, 6, 1));
            assertThat(dto.getEndDate()).isEqualTo(LocalDate.of(2026, 6, 5));
            assertThat(dto.getType()).isEqualTo("annual");
            assertThat(dto.getStatus()).isEqualTo("APPROVED");
            assertThat(dto.getTotalDays()).isEqualTo(5.0);
            assertThat(dto.isHalfDay()).isFalse();
            assertThat(dto.getHalfDaySlot()).isEqualTo("NONE");
            assertThat(dto.getRequestDate()).isEqualTo(LocalDate.of(2026, 5, 20));
            assertThat(dto.getApproverEmails()).containsExactly("approver@example.com");
            assertThat(dto.getRejectionReason()).isNull();
        }

        // ── totalDays passthrough ─────────────────────────────────────────────

        @Test
        void totalDays_wholeDay_passesThrough() {
            LeaveRequest req = fullyPopulatedRequest();
            req.setTotalDays(3.0);
            assertThat(mapper.toLeaveRequestResponse(req).getTotalDays()).isEqualTo(3.0);
        }

        @Test
        void totalDays_halfDay_passesThrough() {
            LeaveRequest req = fullyPopulatedRequest();
            req.setTotalDays(2.5);
            req.setHalfDay(true);
            req.setHalfDaySlot(HalfDaySlot.MORNING);
            LeaveRequestResponseDto dto = mapper.toLeaveRequestResponse(req);
            assertThat(dto.getTotalDays()).isEqualTo(2.5);
            assertThat(dto.isHalfDay()).isTrue();
            assertThat(dto.getHalfDaySlot()).isEqualTo("MORNING");
        }

        @Test
        void totalDays_afternoonHalfDay_passesThrough() {
            LeaveRequest req = fullyPopulatedRequest();
            req.setTotalDays(1.5);
            req.setHalfDay(true);
            req.setHalfDaySlot(HalfDaySlot.AFTERNOON);
            LeaveRequestResponseDto dto = mapper.toLeaveRequestResponse(req);
            assertThat(dto.getTotalDays()).isEqualTo(1.5);
            assertThat(dto.getHalfDaySlot()).isEqualTo("AFTERNOON");
        }

        // ── Enum → String serialisation ───────────────────────────────────────

        @Test
        void allStatusValues_mapToCorrectString() {
            LeaveRequest req = fullyPopulatedRequest();
            for (LeaveStatus status : LeaveStatus.values()) {
                req.setStatus(status);
                assertThat(mapper.toLeaveRequestResponse(req).getStatus()).isEqualTo(status.name());
            }
        }

        @Test
        void allHalfDaySlotValues_mapToCorrectString() {
            LeaveRequest req = fullyPopulatedRequest();
            for (HalfDaySlot slot : HalfDaySlot.values()) {
                req.setHalfDaySlot(slot);
                assertThat(mapper.toLeaveRequestResponse(req).getHalfDaySlot()).isEqualTo(slot.name());
            }
        }

        // ── Null field handling ───────────────────────────────────────────────

        @Test
        void nullHalfDaySlot_defaultsToNoneString() {
            LeaveRequest req = fullyPopulatedRequest();
            req.setHalfDaySlot(null);
            assertThat(mapper.toLeaveRequestResponse(req).getHalfDaySlot()).isEqualTo("NONE");
        }

        @Test
        void nullStatus_mapsToNull() {
            LeaveRequest req = fullyPopulatedRequest();
            req.setStatus(null);
            assertThat(mapper.toLeaveRequestResponse(req).getStatus()).isNull();
        }

        @Test
        void nullApproverEmails_mapsToEmptyList() {
            LeaveRequest req = fullyPopulatedRequest();
            req.setApproverEmails(null);
            assertThat(mapper.toLeaveRequestResponse(req).getApproverEmails())
                    .as("null approverEmails must not reach the frontend as null")
                    .isNotNull()
                    .isEmpty();
        }
    }

    // ── toAuditLogResponse ────────────────────────────────────────────────────

    @Nested
    class ToAuditLogResponse {

        @Test
        void allFields_mapCorrectly() {
            AuditLog log = new AuditLog();
            log.setId("audit-1");
            log.setTimestamp(Instant.parse("2026-04-28T10:00:00Z"));
            log.setActorId("admin-user");
            log.setTargetUserId("target-user");
            log.setActionType("APPROVE_LEAVE");
            log.setBefore(Map.of("status", "PENDING"));
            log.setAfter(Map.of("status", "APPROVED"));

            AuditLogResponseDto dto = mapper.toAuditLogResponse(log);

            assertThat(dto.getId()).isEqualTo("audit-1");
            assertThat(dto.getTimestamp()).isEqualTo(Instant.parse("2026-04-28T10:00:00Z"));
            assertThat(dto.getActorId()).isEqualTo("admin-user");
            assertThat(dto.getTargetUserId()).isEqualTo("target-user");
            assertThat(dto.getActionType()).isEqualTo("APPROVE_LEAVE");
            assertThat(dto.getBefore()).isNotNull();
            assertThat(dto.getAfter()).isNotNull();
        }

        @Test
        void nullBeforeAndAfter_passThrough() {
            AuditLog log = new AuditLog();
            log.setId("audit-2");
            log.setBefore(null);
            log.setAfter(null);

            AuditLogResponseDto dto = mapper.toAuditLogResponse(log);

            assertThat(dto.getBefore()).isNull();
            assertThat(dto.getAfter()).isNull();
        }
    }
}
