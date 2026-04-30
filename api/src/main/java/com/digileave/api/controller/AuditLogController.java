package com.digileave.api.controller;

import com.digileave.api.dto.AuditLogResponseDto;
import com.digileave.api.mapper.DtoMapper;
import com.digileave.api.model.AuditLog;
import com.digileave.api.repository.AuditLogRepository;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

@RestController
@RequestMapping("/api/admin/audit-logs")
public class AuditLogController {

    private final AuditLogRepository repository;
    private final DtoMapper          mapper;

    public AuditLogController(AuditLogRepository repository, DtoMapper mapper) {
        this.repository = repository;
        this.mapper     = mapper;
    }

    @GetMapping
    public ResponseEntity<List<AuditLogResponseDto>> getAuditLogs(
            @RequestParam(required = false) String actorId,
            @RequestParam(required = false) String targetUserId,
            @RequestParam(required = false) String actionType,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate timestampFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate timestampTo) {

        List<AuditLog> logs = repository.findAll(Sort.by(Sort.Direction.DESC, "timestamp"));

        if (actorId != null && !actorId.isBlank()) {
            String lc = actorId.toLowerCase();
            logs = logs.stream()
                    .filter(l -> l.getActorId() != null && l.getActorId().toLowerCase().contains(lc))
                    .toList();
        }
        if (targetUserId != null && !targetUserId.isBlank()) {
            String lc = targetUserId.toLowerCase();
            logs = logs.stream()
                    .filter(l -> l.getTargetUserId() != null && l.getTargetUserId().toLowerCase().contains(lc))
                    .toList();
        }
        if (actionType != null && !actionType.isBlank()) {
            logs = logs.stream()
                    .filter(l -> actionType.equalsIgnoreCase(l.getActionType()))
                    .toList();
        }
        if (timestampFrom != null) {
            Instant from = timestampFrom.atStartOfDay(ZoneOffset.UTC).toInstant();
            logs = logs.stream().filter(l -> !l.getTimestamp().isBefore(from)).toList();
        }
        if (timestampTo != null) {
            Instant to = timestampTo.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
            logs = logs.stream().filter(l -> l.getTimestamp().isBefore(to)).toList();
        }

        return ResponseEntity.ok(logs.stream().map(mapper::toAuditLogResponse).toList());
    }
}
