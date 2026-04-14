package com.digileave.api.repository;

import com.digileave.api.model.LeaveRequest;
import com.digileave.api.model.LeaveStatus;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;

public interface LeaveRequestRepository extends MongoRepository<LeaveRequest, String> {

    List<LeaveRequest> findByUserId(String userId);

    List<LeaveRequest> findByUserIdAndStatus(String userId, LeaveStatus status);

    List<LeaveRequest> findByUserIdAndStatusIn(String userId, List<LeaveStatus> statuses);

    List<LeaveRequest> findByStatus(LeaveStatus status);

    List<LeaveRequest> findByStatusAndApproverEmailsContaining(LeaveStatus status, String approverEmail);
}
