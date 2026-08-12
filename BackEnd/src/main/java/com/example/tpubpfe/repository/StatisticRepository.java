package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.Statistic;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface StatisticRepository extends JpaRepository<Statistic, Long> {

    Optional<Statistic> findByStatDateAndCampaignIdIsNullAndSupportIdIsNullAndZoneIdIsNull(LocalDate statDate);

    List<Statistic> findByStatDateBetween(LocalDate start, LocalDate end);

    List<Statistic> findByCampaignId(Long campaignId);
}
