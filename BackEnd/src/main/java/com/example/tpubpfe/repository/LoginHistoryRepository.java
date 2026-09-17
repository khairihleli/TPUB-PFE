package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.LoginHistory;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LoginHistoryRepository extends JpaRepository<LoginHistory, Long> {

    List<LoginHistory> findByUserIdOrderByCreatedAtDescIdDesc(Long userId, Pageable pageable);
}
