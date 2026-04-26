package com.digileave.api.service;

import com.digileave.api.model.AnnualLeaveBalance;
import com.digileave.api.model.LeaveStatus;
import com.digileave.api.model.User;
import com.digileave.api.repository.LeaveRequestRepository;
import com.digileave.api.repository.UserRepository;
import org.springframework.stereotype.Service;
import com.digileave.api.model.LeaveRequest;

import java.util.List;

/**
 * Year-End Freeze / Carry-Over service.
 *
 * Legal context — Art. 176 Bulgarian Labour Code:
 *   Unused leave may be carried over to the following year.
 *   Carried-over leave generally expires after two years from the end of the
 *   year in which it should have been taken.  An expiry date on the
 *   {@code transferred} field should be added when that compliance requirement
 *   needs to be enforced programmatically.
 *
 * Algorithm:
 *   1. Compute each user's remaining annual-leave balance
 *      (entitled + transferred + startingBalanceAdjustment − used).
 *   2. Move that remainder to {@code transferred} for the new year.
 *   3. Set {@code entitled} to the new-year allocation.
 *   4. Reset {@code used} and {@code startingBalanceAdjustment} to zero.
 *
 * Trigger: POST /api/users/year-end-rollover?requesterId={adminId}&newEntitledDays={n}
 */
@Service
public class YearEndService {

    private final UserRepository         userRepository;
    private final LeaveRequestRepository leaveRequestRepository;

    public YearEndService(UserRepository userRepository,
                          LeaveRequestRepository leaveRequestRepository) {
        this.userRepository         = userRepository;
        this.leaveRequestRepository = leaveRequestRepository;
    }

    /**
     * Performs the year-end rollover for every user.
     *
     * @param newEntitledDays  Days to award for the new year.
     *                         Pass {@code null} to keep each user's existing entitled value.
     * @return number of users updated
     */
    public int performRollover(Integer newEntitledDays) {
        List<User> users = userRepository.findAll();
        int count = 0;

        for (User user : users) {
            AnnualLeaveBalance old = getBalance(user);

            // Recompute used from the actual approved records (double for half-day support)
            double actualUsed = leaveRequestRepository
                    .findByUserIdAndStatus(user.getId(), LeaveStatus.APPROVED)
                    .stream()
                    .filter(r -> LeaveService.affectsBalance(r.getType()))
                    .mapToDouble(lr -> lr.getTotalDays())
                    .sum();

            double remaining = old.getEntitled()
                    + old.getTransferred()
                    + old.getStartingBalanceAdjustment()
                    - actualUsed;

            AnnualLeaveBalance fresh = new AnnualLeaveBalance();
            fresh.setEntitled(newEntitledDays != null ? newEntitledDays : old.getEntitled());
            fresh.setTransferred((int) Math.max(0, Math.round(remaining))); // round to whole days; can't carry over a negative
            fresh.setStartingBalanceAdjustment(0);        // reset; admin re-applies if needed
            fresh.setUsed(0);

            user.setAnnualLeave(fresh);
            userRepository.save(user);
            count++;
        }

        return count;
    }

    /** Safe balance reader — falls back to legacy fields on un-migrated documents. */
    private AnnualLeaveBalance getBalance(User user) {
        if (user.getAnnualLeave() != null) return user.getAnnualLeave();
        AnnualLeaveBalance b = new AnnualLeaveBalance();
        b.setEntitled(user.getEntitledDays());
        b.setUsed(user.getUsedDays());
        return b;
    }
}
