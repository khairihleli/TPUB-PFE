package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.MediaFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MediaFileRepository extends JpaRepository<MediaFile, Long> {

    List<MediaFile> findByCampaignId(Long campaignId);
}
