package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.ZoneRequest;
import com.example.tpubpfe.dto.ZoneResponse;
import com.example.tpubpfe.exception.ResourceNotFoundException;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ZoneService {

    private final ZoneRepository zoneRepository;

    @Transactional
    public ZoneResponse create(ZoneRequest request) {
        Zone zone = Zone.builder()
                .name(request.getName())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .radiusKm(request.getRadiusKm())
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .build();
        return toResponse(zoneRepository.save(zone));
    }

    @Transactional(readOnly = true)
    public List<ZoneResponse> getAll() {
        return zoneRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ZoneResponse> getActive() {
        return zoneRepository.findByIsActiveTrue().stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public ZoneResponse getById(Long id) {
        return toResponse(findZone(id));
    }

    @Transactional
    public ZoneResponse update(Long id, ZoneRequest request) {
        Zone zone = findZone(id);
        zone.setName(request.getName());
        zone.setLatitude(request.getLatitude());
        zone.setLongitude(request.getLongitude());
        zone.setRadiusKm(request.getRadiusKm());
        if (request.getIsActive() != null) {
            zone.setIsActive(request.getIsActive());
        }
        return toResponse(zoneRepository.save(zone));
    }

    @Transactional
    public void delete(Long id) {
        zoneRepository.delete(findZone(id));
    }

    public Zone findZone(Long id) {
        return zoneRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Zone not found: " + id));
    }

    private ZoneResponse toResponse(Zone zone) {
        return ZoneResponse.builder()
                .id(zone.getId())
                .name(zone.getName())
                .latitude(zone.getLatitude())
                .longitude(zone.getLongitude())
                .radiusKm(zone.getRadiusKm())
                .isActive(zone.getIsActive())
                .build();
    }
}
