package com.digileave.api.dto;

import lombok.Data;

import java.time.Instant;

@Data
public class AuditLogResponseDto {

    private String  id;
    private Instant timestamp;
    private String  actorId;
    private String  targetUserId;
    private String  actionType;
    private Object  before;
    private Object  after;
}
