package com.digileave.api.controller;

import com.digileave.api.dto.AuthResponse;
import com.digileave.api.dto.LoginRequest;
import com.digileave.api.mapper.DtoMapper;
import com.digileave.api.model.RefreshToken;
import com.digileave.api.model.User;
import com.digileave.api.repository.RefreshTokenRepository;
import com.digileave.api.service.AuthService;
import com.digileave.api.service.JwtService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String REFRESH_COOKIE = "refresh_token";

    @Value("${jwt.refresh-token-expiry-days:7}")
    private int refreshTokenExpiryDays;

    @Value("${jwt.cookie-secure:true}")
    private boolean cookieSecure;

    private final AuthService            authService;
    private final JwtService             jwtService;
    private final RefreshTokenRepository refreshTokenRepository;
    private final DtoMapper              mapper;

    public AuthController(AuthService authService,
                          JwtService jwtService,
                          RefreshTokenRepository refreshTokenRepository,
                          DtoMapper mapper) {
        this.authService            = authService;
        this.jwtService             = jwtService;
        this.refreshTokenRepository = refreshTokenRepository;
        this.mapper                 = mapper;
    }

    @PostMapping("/google")
    public ResponseEntity<AuthResponse> googleLogin(
            @RequestBody LoginRequest request,
            HttpServletResponse response) {
        try {
            User user = authService.verifyAndUpsertUser(request.getIdToken());
            String accessToken = jwtService.generateAccessToken(user.getId());
            issueRefreshCookie(user.getId(), response);
            return ResponseEntity.ok(new AuthResponse(accessToken, mapper.toUserResponse(user)));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, String>> refresh(
            @CookieValue(name = REFRESH_COOKIE, required = false) String rawToken,
            HttpServletResponse response) {

        if (rawToken == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        String hash = sha256(rawToken);
        RefreshToken stored = refreshTokenRepository.findByTokenHash(hash).orElse(null);

        if (stored == null || stored.getExpiresAt().isBefore(Instant.now())) {
            clearRefreshCookie(response);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Rotate: delete old token and issue a new one
        refreshTokenRepository.delete(stored);
        issueRefreshCookie(stored.getUserId(), response);

        String accessToken = jwtService.generateAccessToken(stored.getUserId());
        return ResponseEntity.ok(Map.of("accessToken", accessToken));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String rawToken,
            HttpServletResponse response) {

        if (rawToken != null) {
            refreshTokenRepository.findByTokenHash(sha256(rawToken))
                    .ifPresent(refreshTokenRepository::delete);
        }
        clearRefreshCookie(response);
        return ResponseEntity.noContent().build();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void issueRefreshCookie(String userId, HttpServletResponse response) {
        String raw = UUID.randomUUID().toString();

        RefreshToken rt = new RefreshToken();
        rt.setUserId(userId);
        rt.setTokenHash(sha256(raw));
        rt.setExpiresAt(Instant.now().plus(refreshTokenExpiryDays, ChronoUnit.DAYS));
        refreshTokenRepository.save(rt);

        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, raw)
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSecure ? "Strict" : "Lax")
                .path("/api/auth")
                .maxAge(refreshTokenExpiryDays * 24L * 60 * 60)
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }

    private void clearRefreshCookie(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(REFRESH_COOKIE, "")
                .httpOnly(true)
                .secure(cookieSecure)
                .sameSite(cookieSecure ? "Strict" : "Lax")
                .path("/api/auth")
                .maxAge(0)
                .build();
        response.addHeader("Set-Cookie", cookie.toString());
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
