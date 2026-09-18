package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.PresenceState;
import com.example.zelqanepfe.model.SupportPresence;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;

public interface SupportPresenceRepository extends JpaRepository<SupportPresence, Long> {

    List<SupportPresence> findByStateAndLastHeartbeatAtBefore(PresenceState state, Instant threshold);
}
