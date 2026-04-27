package com.digileave.api.service;

import com.digileave.api.model.AuditLog;
import com.digileave.api.repository.AuditLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
public class AuditLogService {

    private static final Logger log = LoggerFactory.getLogger(AuditLogService.class);

    private final AuditLogRepository repository;

    public AuditLogService(AuditLogRepository repository) {
        this.repository = repository;
    }

    @Async
    public void log(String actorId, String targetUserId, String actionType,
                    Object before, Object after) {
        try {
            AuditLog entry = new AuditLog();
            entry.setTimestamp(Instant.now());
            entry.setActorId(actorId);
            entry.setTargetUserId(targetUserId);
            entry.setActionType(actionType);
            entry.setBefore(before);
            entry.setAfter(after);
            repository.save(entry);
        } catch (Exception e) {
            log.error("Audit log write failed — action={} actor={} target={}: {}",
                    actionType, actorId, targetUserId, e.getMessage(), e);
        }
    }
}
