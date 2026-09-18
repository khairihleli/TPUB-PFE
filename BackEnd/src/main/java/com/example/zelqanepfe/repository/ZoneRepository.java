package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.Zone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ZoneRepository extends JpaRepository<Zone, Long> {

    List<Zone> findByIsActiveTrue();

    long countByIsActiveTrue();
}
