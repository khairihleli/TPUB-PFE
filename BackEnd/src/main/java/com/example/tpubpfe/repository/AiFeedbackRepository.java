package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.AiFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;

public interface AiFeedbackRepository extends JpaRepository<AiFeedback, Long>, JpaSpecificationExecutor<AiFeedback> {

    @Query("select f.decisionLog.id from AiFeedback f")
    List<Long> findDecisionLogIds();

    List<AiFeedback> findByCreatedAtGreaterThanEqualAndCreatedAtLessThan(Instant from, Instant to);

    List<AiFeedback> findByCreatedAtGreaterThanEqual(Instant from);
}
