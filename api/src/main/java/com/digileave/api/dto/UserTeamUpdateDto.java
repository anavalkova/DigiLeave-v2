package com.digileave.api.dto;

import com.digileave.api.model.Team;
import lombok.Data;

@Data
public class UserTeamUpdateDto {
    private Team team;
}
