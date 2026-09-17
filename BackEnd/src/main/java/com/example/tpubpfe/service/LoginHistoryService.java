package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.LoginHistoryResponse;
import com.example.tpubpfe.model.LoginFailureReason;
import com.example.tpubpfe.model.LoginHistory;
import com.example.tpubpfe.repository.LoginHistoryRepository;
import com.example.tpubpfe.security.RequestInfo;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;

/** Login attempts journal ({@code login_history}). */
@Service
@RequiredArgsConstructor
public class LoginHistoryService {

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 100;

    private final LoginHistoryRepository repository;
    private final Clock clock;

    /** Joins the login transaction. */
    @Transactional
    public void recordSuccess(Long userId, String email, String sessionId, HttpServletRequest request) {
        repository.save(entry(userId, email, true, null, sessionId, request));
    }

    /** Own transaction, so the row survives the 401 thrown right after. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(Long userId, String email, LoginFailureReason reason, HttpServletRequest request) {
        repository.save(entry(userId, email, false, reason, null, request));
    }

    @Transactional(readOnly = true)
    public List<LoginHistoryResponse> list(Long userId, Integer limit) {
        return repository.findByUserIdOrderByCreatedAtDescIdDesc(userId, PageRequest.of(0, clampLimit(limit))).stream()
                .map(LoginHistoryService::toResponse)
                .toList();
    }

    static int clampLimit(Integer limit) {
        if (limit == null) {
            return DEFAULT_LIMIT;
        }
        return Math.max(1, Math.min(MAX_LIMIT, limit));
    }

    private LoginHistory entry(Long userId, String email, boolean success, LoginFailureReason reason, String sessionId,
                               HttpServletRequest request) {
        return LoginHistory.builder()
                .userId(userId)
                .email(RequestInfo.truncate(email == null ? "" : email, 255))
                .success(success)
                .failureReason(reason)
                .sessionId(sessionId)
                .ipAddress(RequestInfo.clientIp(request))
                .userAgent(RequestInfo.userAgent(request))
                .createdAt(clock.instant())
                .build();
    }

    static LoginHistoryResponse toResponse(LoginHistory entry) {
        return LoginHistoryResponse.builder()
                .id(entry.getId())
                .email(entry.getEmail())
                .success(Boolean.TRUE.equals(entry.getSuccess()))
                .failureReason(entry.getFailureReason() == null ? null : entry.getFailureReason().name())
                .ipAddress(entry.getIpAddress())
                .userAgent(entry.getUserAgent())
                .createdAt(entry.getCreatedAt())
                .build();
    }
}
