package com.digileave.api.mapper;

import com.digileave.api.dto.AuditLogResponseDto;
import com.digileave.api.dto.LeaveRequestResponseDto;
import com.digileave.api.dto.UserResponseDto;
import com.digileave.api.model.AuditLog;
import com.digileave.api.model.HalfDaySlot;
import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.User;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class DtoMapper {

    public UserResponseDto toUserResponse(User user) {
        UserResponseDto dto = new UserResponseDto();
        dto.setId(user.getId());
        dto.setName(user.getName());
        dto.setEmail(user.getEmail());
        dto.setPicture(user.getPicture());
        dto.setRole(user.getRole() != null ? user.getRole().name() : null);
        dto.setTeam(user.getTeam() != null ? user.getTeam().name() : null);
        dto.setAnnualLeave(user.getAnnualLeave());
        dto.setApproverEmails(user.getApproverEmails() != null ? user.getApproverEmails() : List.of());
        return dto;
    }

    public LeaveRequestResponseDto toLeaveRequestResponse(LeaveRequest request) {
        LeaveRequestResponseDto dto = new LeaveRequestResponseDto();
        dto.setId(request.getId());
        dto.setUserId(request.getUserId());
        dto.setStartDate(request.getStartDate());
        dto.setEndDate(request.getEndDate());
        dto.setType(request.getType());
        dto.setStatus(request.getStatus() != null ? request.getStatus().name() : null);
        dto.setTotalDays(request.getTotalDays());
        dto.setHalfDay(request.isHalfDay());
        HalfDaySlot slot = request.getHalfDaySlot();
        dto.setHalfDaySlot(slot != null ? slot.name() : HalfDaySlot.NONE.name());
        dto.setRequestDate(request.getRequestDate());
        dto.setApproverEmails(request.getApproverEmails() != null ? request.getApproverEmails() : List.of());
        dto.setRejectionReason(request.getRejectionReason());
        return dto;
    }

    public AuditLogResponseDto toAuditLogResponse(AuditLog log) {
        AuditLogResponseDto dto = new AuditLogResponseDto();
        dto.setId(log.getId());
        dto.setTimestamp(log.getTimestamp());
        dto.setActorId(log.getActorId());
        dto.setTargetUserId(log.getTargetUserId());
        dto.setActionType(log.getActionType());
        dto.setBefore(log.getBefore());
        dto.setAfter(log.getAfter());
        return dto;
    }
}
