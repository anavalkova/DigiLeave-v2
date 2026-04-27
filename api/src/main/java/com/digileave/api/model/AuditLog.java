package com.digileave.api.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Data
@Document(collection = "audit_logs")
public class AuditLog {

    @Id
    private String id;

    private Instant timestamp;
    private String  actorId;
    private String  targetUserId;
    private String  actionType;
    private Object  before;
    private Object  after;
}
