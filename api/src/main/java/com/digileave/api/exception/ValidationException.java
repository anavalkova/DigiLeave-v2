package com.digileave.api.exception;

/**
 * Thrown when a business rule or input constraint is violated.
 * Mapped to HTTP 422 Unprocessable Entity by {@link GlobalExceptionHandler}.
 */
public class ValidationException extends RuntimeException {
    public ValidationException(String message) {
        super(message);
    }
}
