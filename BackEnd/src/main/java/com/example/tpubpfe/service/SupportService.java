package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.SupportRequest;
import com.example.tpubpfe.dto.SupportResponse;
import com.example.tpubpfe.exception.ResourceNotFoundException;
import com.example.tpubpfe.model.DiffusionSupport;
import com.example.tpubpfe.model.TechnicalStatus;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SupportService {

    private final DiffusionSupportRepository supportRepository;
    private final ZoneService zoneService;

    @Transactional
    public SupportResponse create(SupportRequest request) {
        DiffusionSupport support = DiffusionSupport.builder()
                .zone(zoneService.findZone(request.getZoneId()))
                .name(request.getName())
                .supportType(request.getSupportType())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .technicalStatus(request.getTechnicalStatus() != null
                        ? request.getTechnicalStatus() : TechnicalStatus.ACTIF)
                .diffusionCapacity(request.getDiffusionCapacity() != null
                        ? request.getDiffusionCapacity() : (short) 1)
                .build();
        return toResponse(supportRepository.save(support));
    }

    @Transactional(readOnly = true)
    public List<SupportResponse> getAll() {
        return supportRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SupportResponse> getByZone(Long zoneId) {
        return supportRepository.findByZoneId(zoneId).stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public SupportResponse getById(Long id) {
        return toResponse(findSupport(id));
    }

    @Transactional
    public SupportResponse update(Long id, SupportRequest request) {
        DiffusionSupport support = findSupport(id);
        support.setZone(zoneService.findZone(request.getZoneId()));
        support.setName(request.getName());
        support.setSupportType(request.getSupportType());
        support.setLatitude(request.getLatitude());
        support.setLongitude(request.getLongitude());
        if (request.getTechnicalStatus() != null) {
            support.setTechnicalStatus(request.getTechnicalStatus());
        }
        if (request.getDiffusionCapacity() != null) {
            support.setDiffusionCapacity(request.getDiffusionCapacity());
        }
        return toResponse(supportRepository.save(support));
    }

    public DiffusionSupport findSupport(Long id) {
        return supportRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Support not found: " + id));
    }

    private SupportResponse toResponse(DiffusionSupport support) {
        return SupportResponse.builder()
                .id(support.getId())
                .zoneId(support.getZone().getId())
                .zoneName(support.getZone().getName())
                .name(support.getName())
                .supportType(support.getSupportType().name())
                .latitude(support.getLatitude())
                .longitude(support.getLongitude())
                .technicalStatus(support.getTechnicalStatus().name())
                .diffusionCapacity(support.getDiffusionCapacity())
                .build();
    }
}
