package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.Client;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ClientRepository extends JpaRepository<Client, Long> {

    Optional<Client> findByUserId(Long userId);

    List<Client> findByUserIdIn(Collection<Long> userIds);

    /** Rows of [clientId, campaignCount]. */
    @Query("SELECT c.client.id, COUNT(c) FROM Campaign c WHERE c.client.id IN :clientIds GROUP BY c.client.id")
    List<Object[]> countCampaignsByClientIds(@Param("clientIds") Collection<Long> clientIds);
}
