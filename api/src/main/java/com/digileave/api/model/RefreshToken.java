package com.digileave.api.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Data
@Document(collection = "refresh_tokens")
public class RefreshToken {

    @Id
    private String id;

    private String userId;

    @Indexed(unique = true)
    private String tokenHash;

    /** MongoDB TTL index: documents are auto-deleted after this instant. */
    @Indexed(expireAfterSeconds = 0)
    private Instant expiresAt;
}
