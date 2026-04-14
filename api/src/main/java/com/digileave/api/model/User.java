package com.digileave.api.model;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.List;

@Data
@Document(collection = "users")
public class User {

    @Id
    private String id;

    private String googleId;
    private String email;
    private String name;
    private String picture;
    private Role role;
    private int entitledDays;
    private int remainingDays;
    private int usedDays;
    private List<String> approverEmails;
}
