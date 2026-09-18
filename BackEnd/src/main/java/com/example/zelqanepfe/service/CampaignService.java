package com.example.zelqanepfe.service;

import com.example.zelqanepfe.dto.CampaignRequest;
import com.example.zelqanepfe.dto.CampaignResponse;
import com.example.zelqanepfe.dto.PageResponse;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.CampaignStatus;
import com.example.zelqanepfe.model.Client;
import com.example.zelqanepfe.model.ClientValidationStatus;
import com.example.zelqanepfe.model.ReservationStatus;
import com.example.zelqanepfe.repository.AiContentCheckRepository;
import com.example.zelqanepfe.repository.AiDecisionLogRepository;
import com.example.zelqanepfe.repository.CampaignRepository;
import com.example.zelqanepfe.repository.CampaignZoneRepository;
import com.example.zelqanepfe.repository.ClientRepository;
import com.example.zelqanepfe.repository.MediaFileRepository;
import com.example.zelqanepfe.repository.PaymentSimulationRepository;
import com.example.zelqanepfe.repository.ReservationRepository;
import com.example.zelqanepfe.security.UserDetailsImpl;
import com.example.zelqanepfe.service.storage.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Campaign CRUD, lifecycle entry points (reopen, submit) and search (contract §2.1).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CampaignService {

    static final int MAX_PAGE_SIZE = 100;

    private final CampaignRepository campaignRepository;
    private final ClientRepository clientRepository;
    private final CampaignZoneRepository campaignZoneRepository;
    private final ReservationRepository reservationRepository;
    private final MediaFileRepository mediaFileRepository;
    private final PaymentSimulationRepository paymentSimulationRepository;
    private final AiContentCheckRepository aiContentCheckRepository;
    private final AiDecisionLogRepository aiDecisionLogRepository;
    private final CampaignAccessGuard accessGuard;
    private final CampaignMapper campaignMapper;
    private final CampaignReservationSync reservationSync;
    private final AiVerificationService aiVerificationService;
    private final FileStorageService fileStorageService;
    private final Clock clock;

    @Transactional
    public CampaignResponse create(CampaignRequest request) {
        Client client = currentClient();
        ensureClientAllowed(client);
        validateSchedule(request.getStartDate(), request.getEndDate(), request.getStartTime(), request.getEndTime(),
                true);
        Campaign campaign = Campaign.builder()
                .client(client)
                .name(request.getName().trim())
                .objective(request.getObjective())
                .budget(request.getBudget())
                .startDate(request.getStartDate())
                .endDate(request.getEndDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .status(CampaignStatus.BROUILLON)
                .build();
        return campaignMapper.toResponse(campaignRepository.save(campaign));
    }

    @Transactional(readOnly = true)
    public CampaignResponse getById(Long id) {
        return campaignMapper.toResponse(accessGuard.readable(id));
    }

    /** Staff search, paginated. */
    @Transactional(readOnly = true)
    public PageResponse<CampaignResponse> search(CampaignSearchSpecifications.Filter filter, int page, int size, String sort) {
        PageRequest pageable = PageRequest.of(Math.max(0, page), Math.max(1, Math.min(MAX_PAGE_SIZE, size)),
                CampaignSearchSpecifications.parseSort(sort));
        Page<Campaign> result = campaignRepository.findAll(CampaignSearchSpecifications.of(filter), pageable);
        List<CampaignResponse> items = campaignMapper.toResponses(result.getContent());
        return PageResponse.<CampaignResponse>builder()
                .items(items)
                .page(result.getNumber())
                .size(result.getSize())
                .totalItems(result.getTotalElements())
                .totalPages(result.getTotalPages())
                .build();
    }

    /** The current advertiser's campaigns, newest first. */
    @Transactional(readOnly = true)
    public List<CampaignResponse> getMine(CampaignSearchSpecifications.Filter filter) {
        Client client = currentClient();
        CampaignSearchSpecifications.Filter own = (filter == null ? CampaignSearchSpecifications.Filter.empty() : filter)
                .withClientId(client.getId());
        List<Campaign> campaigns = campaignRepository.findAll(CampaignSearchSpecifications.of(own),
                CampaignSearchSpecifications.parseSort(null));
        return campaignMapper.toResponses(campaigns);
    }

    @Transactional
    public CampaignResponse update(Long id, CampaignRequest request) {
        Campaign campaign = accessGuard.owned(id);
        ensureClientAllowed(campaign.getClient());
        if (!CampaignLifecycle.acceptsUpdate(campaign.getStatus())) {
            throw CampaignErrors.notEditable();
        }
        boolean startChanged = !Objects.equals(request.getStartDate(), campaign.getStartDate());
        validateSchedule(request.getStartDate(), request.getEndDate(), request.getStartTime(), request.getEndTime(),
                startChanged);
        CampaignLifecycle.reopen(campaign);

        campaign.setName(request.getName().trim());
        campaign.setObjective(request.getObjective());
        campaign.setBudget(request.getBudget());
        campaign.setStartDate(request.getStartDate());
        campaign.setEndDate(request.getEndDate());
        campaign.setStartTime(request.getStartTime());
        campaign.setEndTime(request.getEndTime());
        campaignRepository.save(campaign);

        List<Long> cancelled = reservationSync.cancel(campaign, Set.of(ReservationStatus.TEMPORAIRE),
                reservation -> !CampaignReservationSync.insideCampaignWindow(reservation, campaign));
        if (!cancelled.isEmpty()) {
            log.info("Campagne {} : {} réservation(s) temporaire(s) annulée(s) après modification", id, cancelled.size());
        }
        reservationSync.recomputeEstimatedViews(campaign);
        return campaignMapper.toResponse(campaign);
    }

    @Transactional
    public void delete(Long id) {
        Campaign campaign = accessGuard.owned(id);
        if (!CampaignLifecycle.isDeletable(campaign.getStatus())) {
            throw CampaignErrors.notEditable();
        }
        Long campaignId = campaign.getId();
        // Explicit child deletion keeps the behaviour identical with and without database-level cascades.
        aiDecisionLogRepository.deleteAll(aiDecisionLogRepository.findByCampaignId(campaignId));
        aiContentCheckRepository.deleteAll(aiContentCheckRepository.findByCampaignId(campaignId));
        campaignZoneRepository.deleteAll(campaignZoneRepository.findByCampaignId(campaignId));
        reservationRepository.deleteAll(reservationRepository.findByCampaignId(campaignId));
        paymentSimulationRepository.deleteAll(paymentSimulationRepository.findByCampaignId(campaignId));
        mediaFileRepository.deleteAll(mediaFileRepository.findByCampaignId(campaignId));
        campaignRepository.delete(campaign);
        afterCommit(() -> fileStorageService.deleteDirectory("campaigns/" + campaignId));
    }

    @Transactional
    public CampaignResponse reopen(Long id) {
        Campaign campaign = accessGuard.owned(id);
        if (!CampaignLifecycle.reopen(campaign)) {
            throw CampaignErrors.notEditable();
        }
        return campaignMapper.toResponse(campaignRepository.save(campaign));
    }

    /** BROUILLON → PENDING_AI_CHECK → AI result, in the same transaction. */
    @Transactional
    public CampaignResponse submit(Long id) {
        Campaign campaign = accessGuard.owned(id);
        ensureClientAllowed(campaign.getClient());
        if (!CampaignLifecycle.isSubmittable(campaign.getStatus())) {
            throw CampaignErrors.notSubmittable();
        }
        Map<String, String> missing = submitCompleteness(campaign);
        if (!missing.isEmpty()) {
            throw CampaignErrors.submitIncomplete(missing);
        }
        campaign.setStatus(CampaignStatus.PENDING_AI_CHECK);
        campaign.setSubmittedAt(Instant.now(clock));
        campaignRepository.save(campaign);
        aiVerificationService.runCheck(campaign, false);
        return campaignMapper.toResponse(campaign);
    }

    /** Used by other services (e.g. reservations) that need the entity without access rules. */
    public Campaign findCampaign(Long id) {
        return campaignRepository.findById(id).orElseThrow(CampaignErrors::campaignNotFound);
    }

    Map<String, String> submitCompleteness(Campaign campaign) {
        LocalDate today = LocalDate.now(clock);
        Map<String, String> errors = new LinkedHashMap<>();
        if (campaign.getStartDate() == null || campaign.getEndDate() == null) {
            errors.put("period", "Renseignez les dates de début et de fin de diffusion.");
        } else if (campaign.getEndDate().isBefore(today)) {
            errors.put("period", "La période de diffusion est déjà terminée.");
        }
        LocalTime startTime = campaign.getStartTime();
        LocalTime endTime = campaign.getEndTime();
        if (startTime == null || endTime == null) {
            errors.put("times", "Renseignez le créneau horaire de diffusion.");
        } else if (!startTime.isBefore(endTime)) {
            errors.put("times", "L'heure de début doit précéder l'heure de fin.");
        }
        if (campaign.getBudget() == null || campaign.getBudget().compareTo(BigDecimal.ZERO) <= 0) {
            errors.put("budget", "Le budget doit être supérieur à 0 TND.");
        }
        if (campaignZoneRepository.countByCampaignId(campaign.getId()) == 0) {
            errors.put("zones", "Ciblez au moins une zone sur la carte.");
        }
        if (!reservationSync.hasLiveTemporary(campaign, today)) {
            errors.put("reservations", "Réservez au moins un Porteur pour la période choisie.");
        }
        return errors;
    }

    void validateSchedule(LocalDate startDate, LocalDate endDate, LocalTime startTime, LocalTime endTime,
                          boolean checkStartInPast) {
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw CampaignErrors.invalidPeriod();
        }
        if ((startTime == null) != (endTime == null)) {
            throw CampaignErrors.invalidTimeRange();
        }
        if (startTime != null && !startTime.isBefore(endTime)) {
            throw CampaignErrors.invalidTimeRange();
        }
        if (checkStartInPast && startDate != null && startDate.isBefore(LocalDate.now(clock))) {
            throw CampaignErrors.startDateInPast();
        }
    }

    Client currentClient() {
        UserDetailsImpl user = CampaignAccessGuard.currentUser();
        if (user == null) {
            throw CampaignErrors.clientProfileMissing();
        }
        return clientRepository.findByUserId(user.getId()).orElseThrow(CampaignErrors::clientProfileMissing);
    }

    /** Clients REJECTED or SUSPENDED cannot create, edit, submit or duplicate campaigns. */
    public static void ensureClientAllowed(Client client) {
        if (client != null && (client.getValidationStatus() == ClientValidationStatus.REJECTED
                || client.getValidationStatus() == ClientValidationStatus.SUSPENDED)) {
            throw CampaignErrors.clientNotAllowed(HttpStatus.FORBIDDEN);
        }
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    runQuietly(action);
                }
            });
        } else {
            runQuietly(action);
        }
    }

    private static void runQuietly(Runnable action) {
        try {
            action.run();
        } catch (RuntimeException ex) {
            log.warn("Nettoyage des fichiers de campagne impossible : {}", ex.getMessage());
        }
    }
}
