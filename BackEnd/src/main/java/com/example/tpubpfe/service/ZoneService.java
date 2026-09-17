package com.example.tpubpfe.service;

import com.example.tpubpfe.config.GeoPricingProperties;
import com.example.tpubpfe.dto.ZoneRequest;
import com.example.tpubpfe.dto.ZoneResponse;
import com.example.tpubpfe.model.Zone;
import com.example.tpubpfe.repository.CampaignZoneRepository;
import com.example.tpubpfe.repository.DiffusionLogRepository;
import com.example.tpubpfe.repository.DiffusionSupportRepository;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.repository.ReservationRepository;
import com.example.tpubpfe.repository.ZoneRepository;
import com.example.tpubpfe.util.PolygonGeometry;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ZoneService {

    private final ZoneRepository zoneRepository;
    private final DiffusionSupportRepository supportRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final ReservationRepository reservationRepository;
    private final EmergencyMessageRepository emergencyMessageRepository;
    private final DiffusionLogRepository diffusionLogRepository;
    private final AuditService auditService;
    private final GeoPricingProperties.Geo geoProperties;

    /** Polygon validation limits of `tpub.geo.polygon` (docs/round2-contract.md §4.1). */
    public PolygonGeometry.Limits polygonLimits() {
        GeoPricingProperties.Geo.Polygon p = geoProperties.getPolygon();
        return new PolygonGeometry.Limits(p.getMaxVertices(), p.getMaxTotalVertices(), p.getMaxParts(), p.getMaxHoles(),
                p.getMinAreaKm2(), p.getMaxAreaKm2(), p.getMaxRadiusKm());
    }

    @Transactional
    public ZoneResponse create(ZoneRequest request) {
        Zone zone = Zone.builder()
                .name(request.getName())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .radiusKm(request.getRadiusKm())
                .isActive(request.getIsActive() != null ? request.getIsActive() : true)
                .build();
        Zone saved = zoneRepository.save(zone);
        auditService.record("ZONE_CREATED", "ZONE", saved.getId(), "Création de la zone « " + saved.getName() + " »",
                details(saved));
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<ZoneResponse> getAll() {
        return zoneRepository.findAll().stream().map(ZoneService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ZoneResponse> getActive() {
        return zoneRepository.findByIsActiveTrue().stream().map(ZoneService::toResponse).toList();
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
        Zone saved = zoneRepository.save(zone);
        auditService.record("ZONE_UPDATED", "ZONE", saved.getId(), "Modification de la zone « " + saved.getName() + " »",
                details(saved));
        return toResponse(saved);
    }

    /** Deleting a zone referenced by supports, campaigns, reservations, emergencies or diffusions → 409 ZONE_IN_USE. */
    @Transactional
    public void delete(Long id) {
        Zone zone = findZone(id);
        if (supportRepository.countByZoneId(id) > 0
                || !campaignZoneRepository.findByZoneId(id).isEmpty()
                || reservationRepository.countByZoneId(id) > 0
                || emergencyMessageRepository.countByZoneId(id) > 0
                || diffusionLogRepository.countByZoneId(id) > 0) {
            throw NetworkErrors.zoneInUse();
        }
        try {
            zoneRepository.delete(zone);
            zoneRepository.flush();
        } catch (DataIntegrityViolationException ex) {
            throw NetworkErrors.zoneInUse();
        }
        auditService.record("ZONE_DELETED", "ZONE", id, "Suppression de la zone « " + zone.getName() + " »", null);
    }

    public Zone findZone(Long id) {
        if (id == null) {
            throw NetworkErrors.zoneNotFound();
        }
        return zoneRepository.findById(id).orElseThrow(NetworkErrors::zoneNotFound);
    }

    public static ZoneResponse toResponse(Zone zone) {
        return ZoneResponse.builder()
                .id(zone.getId())
                .name(zone.getName())
                .latitude(zone.getLatitude())
                .longitude(zone.getLongitude())
                .radiusKm(zone.getRadiusKm())
                .isActive(zone.getIsActive())
                .build();
    }

    private static Map<String, Object> details(Zone zone) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("latitude", zone.getLatitude());
        details.put("longitude", zone.getLongitude());
        details.put("radiusKm", zone.getRadiusKm());
        details.put("isActive", zone.getIsActive());
        return details;
    }
}
