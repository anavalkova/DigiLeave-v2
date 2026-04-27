package com.digileave.api.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class AuthResponse {
    private String          accessToken;
    private UserResponseDto user;
}
