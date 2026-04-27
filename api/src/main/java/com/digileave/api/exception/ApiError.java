package com.digileave.api.exception;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.time.Instant;

/** Structured error envelope returned by {@link GlobalExceptionHandler} for all error responses. */
@Data
@AllArgsConstructor
public class ApiError {
    private int     status;
    private String  error;
    private String  message;
    private Instant timestamp;
}
