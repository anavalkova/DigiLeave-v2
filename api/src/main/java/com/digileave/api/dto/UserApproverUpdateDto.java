package com.digileave.api.dto;

import lombok.Data;

import java.util.List;

@Data
public class UserApproverUpdateDto {

    private List<String> approverEmails;
}
