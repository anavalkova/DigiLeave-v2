package com.digileave.api.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.List;

@Data
@Document(collection = "users")
public class User {

    @Id
    private String id;

    private String googleId;
    private String email;
    private String name;
    private String picture;
    private Role   role;

    /**
     * Ledger-based annual leave balance (current system).
     * Null only on legacy documents that have not yet been migrated —
     * the service layer falls back to the deprecated fields below.
     */
    private AnnualLeaveBalance annualLeave;

    // ── Legacy fields kept for zero-downtime migration ──────────────────────
    // These are populated in pre-ledger documents.  Once the migration script
    // (migrate-to-ledger.mjs) has run against every environment, these fields
    // can be removed from this class and from MongoDB with an unset migration.
    /** @deprecated Use {@code annualLeave.entitled} instead. */
    @Deprecated private int entitledDays;
    /** @deprecated Derived from annualLeave; no longer maintained. */
    @Deprecated private int remainingDays;
    /** @deprecated Use {@code annualLeave.used} instead. */
    @Deprecated private int usedDays;

    private List<String> approverEmails;

    /** Team assignment — used for calendar and dashboard filtering. */
    private Team team;
}
