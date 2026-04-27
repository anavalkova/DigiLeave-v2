package com.digileave.api.dto;

import com.digileave.api.model.AnnualLeaveBalance;
import com.digileave.api.model.User;
import lombok.Data;

import java.util.List;

/**
 * API response representation of a user.
 *
 * Deliberately omits internal fields ({@code googleId}, deprecated legacy balance
 * fields) so the persistence model can evolve independently of the API contract.
 */
@Data
public class UserResponseDto {

    private String             id;
    private String             name;
    private String             email;
    private String             picture;
    /** Serialised enum name — e.g. "ADMIN", "APPROVER", "USER". */
    private String             role;
    private AnnualLeaveBalance annualLeave;
    private List<String>       approverEmails;
    /** Serialised enum name — e.g. "OPR", "DEV", or null when unassigned. */
    private String             team;

    /**
     * Maps a {@link User} entity to a {@link UserResponseDto}.
     *
     * @param user the entity to map; must not be null
     * @return a fully populated response DTO
     */
    public static UserResponseDto from(User user) {
        UserResponseDto dto = new UserResponseDto();
        dto.setId(user.getId());
        dto.setName(user.getName());
        dto.setEmail(user.getEmail());
        dto.setPicture(user.getPicture());
        dto.setRole(user.getRole()  != null ? user.getRole().name()  : null);
        dto.setTeam(user.getTeam()  != null ? user.getTeam().name()  : null);
        dto.setAnnualLeave(user.getAnnualLeave());
        dto.setApproverEmails(user.getApproverEmails());
        return dto;
    }
}
