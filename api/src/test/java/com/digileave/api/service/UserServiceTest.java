package com.digileave.api.service;

import com.digileave.api.mapper.DtoMapper;
import com.digileave.api.model.AnnualLeaveBalance;
import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock private UserRepository         userRepository;
    @Mock private LeaveRequestRepository leaveRequestRepository;
    @Mock private AuditLogService        auditLogService;
    @Mock private DtoMapper              mapper;

    @InjectMocks
    private UserService userService;

    @Test
    void newGoogleRegistration_withNullAnnualLeave_shouldBeRepairedTo20EntitledDays() {
        // Simulates a user registered via Google OAuth before the fix:
        // annualLeave was never initialised, entitledDays defaulted to 0.
        User user = new User();
        user.setId("user-1");
        user.setEmail("employee@digitoll.bg");
        user.setEntitledDays(0);
        // annualLeave intentionally left null — the broken registration state

        ArgumentCaptor<User> savedCaptor = ArgumentCaptor.forClass(User.class);
        when(userRepository.findAll()).thenReturn(List.of(user));
        when(userRepository.save(savedCaptor.capture())).thenReturn(user);

        int repaired = userService.repairMissingEntitlement();

        assertThat(repaired).isEqualTo(1);
        User saved = savedCaptor.getValue();
        assertThat(saved.getAnnualLeave()).isNotNull();
        assertThat((double) saved.getAnnualLeave().getEntitled()).isEqualTo(20.0);
        assertThat(saved.getEntitledDays()).isEqualTo(20);
    }

    @Test
    void newGoogleRegistration_withZeroEntitledInBalance_shouldBeRepairedTo20() {
        User user = new User();
        user.setId("user-2");
        AnnualLeaveBalance bal = new AnnualLeaveBalance();
        bal.setEntitled(0);
        user.setAnnualLeave(bal);

        ArgumentCaptor<User> savedCaptor = ArgumentCaptor.forClass(User.class);
        when(userRepository.findAll()).thenReturn(List.of(user));
        when(userRepository.save(savedCaptor.capture())).thenReturn(user);

        int repaired = userService.repairMissingEntitlement();

        assertThat(repaired).isEqualTo(1);
        assertThat((double) savedCaptor.getValue().getAnnualLeave().getEntitled()).isEqualTo(20.0);
    }

    @Test
    void repairMissingEntitlement_skipsUsersWhoseEntitlementIsAlreadySet() {
        User user = new User();
        user.setId("user-3");
        AnnualLeaveBalance bal = new AnnualLeaveBalance();
        bal.setEntitled(20);
        user.setAnnualLeave(bal);

        when(userRepository.findAll()).thenReturn(List.of(user));

        int repaired = userService.repairMissingEntitlement();

        assertThat(repaired).isZero();
        verify(userRepository, never()).save(any());
    }

    @Test
    void adjustBalance_recomputesUsed_andAvailableExcludesEntitled() {
        // entitled is informational only now — leave is deducted from
        // startingBalanceAdjustment (+ transferred), never from entitled.
        User user = new User();
        user.setId("user-4");
        AnnualLeaveBalance bal = new AnnualLeaveBalance();
        bal.setEntitled(20);
        bal.setTransferred(3);
        user.setAnnualLeave(bal);

        LeaveRequest approved = new LeaveRequest();
        approved.setType("Annual");
        approved.setStatus(LeaveStatus.APPROVED);
        approved.setTotalDays(2);

        when(userRepository.findById("user-4")).thenReturn(Optional.of(user));
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(leaveRequestRepository.findByUserIdAndStatus("user-4", LeaveStatus.APPROVED))
                .thenReturn(List.of(approved));

        ArgumentCaptor<User> savedCaptor = ArgumentCaptor.forClass(User.class);

        userService.adjustBalance("user-4", 23, 10);

        verify(userRepository, times(1)).save(savedCaptor.capture());
        AnnualLeaveBalance saved = savedCaptor.getValue().getAnnualLeave();
        assertThat(saved.getEntitled()).isEqualTo(23.0);
        assertThat(saved.getStartingBalanceAdjustment()).isEqualTo(10.0);
        assertThat(saved.getUsed()).isEqualTo(2.0);
        assertThat(saved.available()).isEqualTo(3 + 10 - 2);
    }
}
