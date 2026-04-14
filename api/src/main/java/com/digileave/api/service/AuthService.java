package com.digileave.api.service;

import com.digileave.api.model.Role;
import com.digileave.api.model.User;
import com.digileave.api.repository.UserRepository;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.Collections;
import java.util.List;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final String ADMIN_EMAIL      = "valkovaa@digitoll.bg";
    private static final String COMPANY_DOMAIN   = "@digitoll.bg";
    private static final int    COMPANY_ENTITLED = 20;

    @Value("${google.client-id}")
    private String googleClientId;

    private final UserRepository userRepository;

    public AuthService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** Fail fast at startup with an actionable message if the env var is missing. */
    @PostConstruct
    void validateConfig() {
        if (googleClientId == null || googleClientId.isBlank()) {
            log.error("GOOGLE_CLIENT_ID environment variable is missing or empty. " +
                      "Set it before starting the application: " +
                      "export GOOGLE_CLIENT_ID=<your-client-id>");
        } else {
            log.info("Google OAuth configured — client ID ends with: ...{}",
                     googleClientId.substring(Math.max(0, googleClientId.length() - 12)));
        }
    }

    public User verifyAndUpsertUser(String idToken) throws GeneralSecurityException, IOException {
        if (googleClientId == null || googleClientId.isBlank()) {
            throw new IllegalStateException(
                "GOOGLE_CLIENT_ID environment variable is missing. " +
                "The backend cannot verify Google tokens without it.");
        }

        log.debug("Verifying Google token against client ID ending: ...{}",
                  googleClientId.substring(Math.max(0, googleClientId.length() - 12)));

        GoogleIdTokenVerifier verifier = new GoogleIdTokenVerifier.Builder(
                new NetHttpTransport(), GsonFactory.getDefaultInstance())
                .setAudience(Collections.singletonList(googleClientId))
                .build();

        GoogleIdToken googleIdToken;
        try {
            googleIdToken = verifier.verify(idToken);
        } catch (Exception e) {
            log.error("Google token verification threw an exception — likely a network or library error: {}", e.getMessage(), e);
            throw new IllegalArgumentException("Google token verification failed: " + e.getMessage(), e);
        }

        if (googleIdToken == null) {
            // verify() returns null (rather than throwing) when the token signature is invalid,
            // the audience doesn't match this client ID, or the token is expired.
            log.error("Google token verification returned null. " +
                      "Causes: token expired, wrong client ID (expected ...{}), or tampered token.",
                      googleClientId.substring(Math.max(0, googleClientId.length() - 12)));
            throw new IllegalArgumentException(
                "Invalid Google ID token — check that GOOGLE_CLIENT_ID matches the one " +
                "configured in Google Cloud Console and that the token has not expired.");
        }

        GoogleIdToken.Payload payload = googleIdToken.getPayload();
        String googleId = payload.getSubject();
        String email    = payload.getEmail();
        String name     = (String) payload.get("name");
        String picture  = (String) payload.get("picture");

        return userRepository.findByEmail(email)
                .map(existing -> {
                    existing.setGoogleId(googleId);
                    existing.setName(name);
                    existing.setPicture(picture);
                    // Always enforce ADMIN for the designated email;
                    // for everyone else, only assign role if it has never been set
                    if (ADMIN_EMAIL.equals(email) || existing.getRole() == null) {
                        existing.setRole(resolveRole(email));
                    }
                    // Migrate entitlement for users created before entitlement was introduced
                    if (existing.getEntitledDays() == 0 && email.endsWith(COMPANY_DOMAIN)) {
                        existing.setEntitledDays(COMPANY_ENTITLED);
                        existing.setRemainingDays(COMPANY_ENTITLED);
                    }
                    // Migrate approverEmails for users created before hierarchy was introduced
                    if ((existing.getApproverEmails() == null || existing.getApproverEmails().isEmpty())
                            && !ADMIN_EMAIL.equals(email)) {
                        existing.setApproverEmails(List.of(ADMIN_EMAIL));
                    }
                    return userRepository.save(existing);
                })
                .orElseGet(() -> {
                    User user = new User();
                    user.setGoogleId(googleId);
                    user.setEmail(email);
                    user.setName(name);
                    user.setPicture(picture);
                    user.setRole(resolveRole(email));
                    if (email.endsWith(COMPANY_DOMAIN)) {
                        user.setEntitledDays(COMPANY_ENTITLED);
                        user.setRemainingDays(COMPANY_ENTITLED);
                    }
                    // Default manager for every non-admin user is the admin
                    if (!ADMIN_EMAIL.equals(email)) {
                        user.setApproverEmails(List.of(ADMIN_EMAIL));
                    }
                    return userRepository.save(user);
                });
    }

    private Role resolveRole(String email) {
        return ADMIN_EMAIL.equals(email) ? Role.ADMIN : Role.USER;
    }
}
