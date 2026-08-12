package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.CampaignRequest;
import com.example.tpubpfe.dto.CampaignResponse;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.exception.ResourceNotFoundException;
import com.example.tpubpfe.model.Campaign;
import com.example.tpubpfe.model.CampaignStatus;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.repository.CampaignRepository;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CampaignService {

    private final CampaignRepository campaignRepository;
    private final ClientRepository clientRepository;
    private final UserRepository userRepository;

    @Transactional
    public CampaignResponse create(CampaignRequest request) {
        Client client = getClientForCurrentUser();
        Campaign campaign = Campaign.builder()
                .client(client)
                .name(request.getName())
                .objective(request.getObjective())
                .budget(request.getBudget())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .status(CampaignStatus.BROUILLON)
                .build();
        return CampaignMapper.toResponse(campaignRepository.save(campaign));
    }

    @Transactional(readOnly = true)
    public CampaignResponse getById(Long id) {
        return CampaignMapper.toResponse(findCampaign(id));
    }

    @Transactional(readOnly = true)
    public List<CampaignResponse> getAll() {
        return campaignRepository.findAll().stream()
                .map(CampaignMapper::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<CampaignResponse> getMine() {
        Client client = getClientForCurrentUser();
        return campaignRepository.findByClientId(client.getId()).stream()
                .map(CampaignMapper::toResponse)
                .toList();
    }

    @Transactional
    public CampaignResponse update(Long id, CampaignRequest request) {
        Campaign campaign = findCampaign(id);
        ensureEditable(campaign);
        campaign.setName(request.getName());
        campaign.setObjective(request.getObjective());
        campaign.setBudget(request.getBudget());
        campaign.setStartDate(request.getStartDate());
        campaign.setEndDate(request.getEndDate());
        campaign.setStartTime(request.getStartTime());
        campaign.setEndTime(request.getEndTime());
        return CampaignMapper.toResponse(campaignRepository.save(campaign));
    }

    @Transactional
    public void delete(Long id) {
        Campaign campaign = findCampaign(id);
        ensureEditable(campaign);
        campaignRepository.delete(campaign);
    }

    @Transactional
    public CampaignResponse submit(Long id) {
        Campaign campaign = findCampaign(id);
        if (campaign.getStatus() != CampaignStatus.BROUILLON) {
            throw new BadRequestException("Only draft campaigns can be submitted");
        }
        campaign.setStatus(CampaignStatus.PENDING_AI_CHECK);
        campaign.setSubmittedAt(java.time.Instant.now());
        return CampaignMapper.toResponse(campaignRepository.save(campaign));
    }

    public Campaign findCampaign(Long id) {
        return campaignRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Campaign not found: " + id));
    }

    private Client getClientForCurrentUser() {
        String email = SecurityUtils.getCurrentUserEmail();
        return userRepository.findByEmail(email)
                .flatMap(user -> clientRepository.findByUserId(user.getId()))
                .orElseThrow(() -> new BadRequestException("Client profile not found for current user"));
    }

    private void ensureEditable(Campaign campaign) {
        if (campaign.getStatus() != CampaignStatus.BROUILLON
                && campaign.getStatus() != CampaignStatus.REJECTED_BY_AI) {
            throw new BadRequestException("Campaign cannot be modified in status: " + campaign.getStatus());
        }
    }
}
