package com.digileave.api.service;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

import static org.assertj.core.api.Assertions.*;

class JwtServiceTest {

    // 48 ASCII chars → 384-bit key, well above the 256-bit HMAC-SHA minimum
    private static final String SECRET  = "test-secret-key-must-be-at-least-32-bytes-long!!";
    private static final String USER_ID = "user-abc-123";

    private JwtService jwtService;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService();
        ReflectionTestUtils.setField(jwtService, "secret",             SECRET);
        ReflectionTestUtils.setField(jwtService, "accessTokenExpiryMs", 900_000L);
    }

    // ── generateAccessToken ───────────────────────────────────────────────────

    @Nested
    class GenerateAccessToken {

        @Test
        void subject_matchesProvidedUserId() {
            String token = jwtService.generateAccessToken(USER_ID);
            assertThat(jwtService.extractUserId(token)).isEqualTo(USER_ID);
        }

        @Test
        void token_isWellFormedCompactJwt() {
            String token = jwtService.generateAccessToken(USER_ID);
            assertThat(token.split("\\.")).hasSize(3);
        }

        @Test
        void token_signedWithConfiguredSecret_parsesWithoutException() {
            String token = jwtService.generateAccessToken(USER_ID);
            SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
            assertThatNoException().isThrownBy(() ->
                    Jwts.parser().verifyWith(key).build().parseSignedClaims(token));
        }

    }

    // ── isValid ───────────────────────────────────────────────────────────────

    @Nested
    class IsValid {

        @Test
        void validToken_returnsTrue() {
            String token = jwtService.generateAccessToken(USER_ID);
            assertThat(jwtService.isValid(token)).isTrue();
        }

        @Test
        void expiredToken_returnsFalse() {
            ReflectionTestUtils.setField(jwtService, "accessTokenExpiryMs", -1_000L);
            String token = jwtService.generateAccessToken(USER_ID);
            assertThat(jwtService.isValid(token)).isFalse();
        }

        @Test
        void tamperedPayload_returnsFalse() {
            String token   = jwtService.generateAccessToken(USER_ID);
            String[] parts = token.split("\\.");
            String tampered = parts[0] + "." + parts[1] + "TAMPERED" + "." + parts[2];
            assertThat(jwtService.isValid(tampered)).isFalse();
        }

        @Test
        void tamperedSignature_returnsFalse() {
            String token   = jwtService.generateAccessToken(USER_ID);
            String[] parts = token.split("\\.");
            String tampered = parts[0] + "." + parts[1] + ".invalidsignature";
            assertThat(jwtService.isValid(tampered)).isFalse();
        }

        @Test
        void tokenSignedWithDifferentSecret_returnsFalse() {
            SecretKey otherKey = Keys.hmacShaKeyFor(
                    "completely-different-secret-key-32bytes!!".getBytes(StandardCharsets.UTF_8));
            String foreign = Jwts.builder()
                    .subject(USER_ID)
                    .issuedAt(new Date())
                    .expiration(new Date(System.currentTimeMillis() + 900_000L))
                    .signWith(otherKey)
                    .compact();
            assertThat(jwtService.isValid(foreign)).isFalse();
        }

        @Test
        void randomString_returnsFalse() {
            assertThat(jwtService.isValid("not.a.jwt")).isFalse();
        }

        @Test
        void emptyString_returnsFalse() {
            assertThat(jwtService.isValid("")).isFalse();
        }
    }

    // ── extractUserId (claim extraction) ──────────────────────────────────────

    @Nested
    class ExtractUserId {

        @Test
        void extractsSubjectFromSelfIssuedToken() {
            String token = jwtService.generateAccessToken(USER_ID);
            assertThat(jwtService.extractUserId(token)).isEqualTo(USER_ID);
        }

        @Test
        void extractsSubjectFromRawJwtString() {
            SecretKey key = Keys.hmacShaKeyFor(SECRET.getBytes(StandardCharsets.UTF_8));
            String raw = Jwts.builder()
                    .subject("raw-user-42")
                    .issuedAt(new Date())
                    .expiration(new Date(System.currentTimeMillis() + 60_000L))
                    .signWith(key)
                    .compact();
            assertThat(jwtService.extractUserId(raw)).isEqualTo("raw-user-42");
        }

        @Test
        void expiredToken_throwsJwtException() {
            ReflectionTestUtils.setField(jwtService, "accessTokenExpiryMs", -1_000L);
            String token = jwtService.generateAccessToken(USER_ID);
            assertThatThrownBy(() -> jwtService.extractUserId(token))
                    .isInstanceOf(io.jsonwebtoken.JwtException.class);
        }

        @Test
        void tamperedToken_throwsJwtException() {
            String token   = jwtService.generateAccessToken(USER_ID);
            String[] parts = token.split("\\.");
            String tampered = parts[0] + "." + parts[1] + ".badsig";
            assertThatThrownBy(() -> jwtService.extractUserId(tampered))
                    .isInstanceOf(io.jsonwebtoken.JwtException.class);
        }

        @Test
        void differentUserIds_extractCorrectly() {
            String[] ids = {"user-1", "admin-99", "uuid-550e8400-e29b-41d4-a716"};
            for (String id : ids) {
                String token = jwtService.generateAccessToken(id);
                assertThat(jwtService.extractUserId(token)).isEqualTo(id);
            }
        }
    }
}
