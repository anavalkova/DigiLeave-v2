package com.digileave.api.dto;

import com.digileave.api.model.AnnualLeaveBalance;
import lombok.Data;

import java.util.List;

@Data
public class UserResponseDto {

    private String             id;
    private String             name;
    private String             email;
    private String             picture;
    private String             role;
    private AnnualLeaveBalance annualLeave;
    private List<String>       approverEmails;
    private String             team;
}
