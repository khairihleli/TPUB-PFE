package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.EmergencyRequest;
import com.example.tpubpfe.dto.EmergencyResponse;
import com.example.tpubpfe.exception.ResourceNotFoundException;
import com.example.tpubpfe.model.EmergencyMessage;
import com.example.tpubpfe.model.UrgencyLevel;
import com.example.tpubpfe.repository.EmergencyMessageRepository;
import com.example.tpubpfe.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class EmergencyService {

    private final EmergencyMessageRepository emergencyMessageRepository;
    private final ZoneService zoneService;
    private final UserRepository userRepository;

    @Transactional
    public EmergencyResponse create(EmergencyRequest request) {
        EmergencyMessage message = EmergencyMessage.builder()
                .title(request.getTitle())
                .content(request.getContent())
                .zone(zoneService.findZone(request.getZoneId()))
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .durationSeconds(request.getDurationSeconds())
                .priority(request.getPriority() != null ? request.getPriority() : (short) 1)
                .urgencyLevel(request.getUrgencyLevel() != null ? request.getUrgencyLevel() : UrgencyLevel.HIGH)
                .isActive(true)
                .createdByUser(userRepository.findByEmail(SecurityUtils.getCurrentUserEmail())
                        .orElseThrow(() -> new ResourceNotFoundException("Current user not found")))
                .build();
        return toResponse(emergencyMessageRepository.save(message));
    }

    @Transactional(readOnly = true)
    public List<EmergencyResponse> getAll() {
        return emergencyMessageRepository.findAll().stream().map(this::toResponse).toList();
    }

    @Transactional
    public EmergencyResponse deactivate(Long id) {
        EmergencyMessage message = emergencyMessageRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Emergency message not found: " + id));
        message.setIsActive(false);
        return toResponse(emergencyMessageRepository.save(message));
    }

    private EmergencyResponse toResponse(EmergencyMessage message) {
        return EmergencyResponse.builder()
                .id(message.getId())
                .title(message.getTitle())
                .content(message.getContent())
                .zoneId(message.getZone().getId())
                .startDate(message.getStartDate())
                .endDate(message.getEndDate())
                .startTime(message.getStartTime())
                .endTime(message.getEndTime())
                .priority(message.getPriority())
                .urgencyLevel(message.getUrgencyLevel().name())
                .isActive(message.getIsActive())
                .build();
    }
}
