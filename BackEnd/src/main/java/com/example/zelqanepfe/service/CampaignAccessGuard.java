package com.example.zelqanepfe.service;

import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.repository.CampaignRepository;
import com.example.zelqanepfe.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.Set;

/**
 * Campaign-level access control shared by lanes A and B. Every denial is a 404 so ids cannot be probed.
 */
@Component
@RequiredArgsConstructor
public class CampaignAccessGuard {

    private static final Set<String> STAFF = Set.of(
            RoleCode.ADMINISTRATEUR.name(), RoleCode.SUPERVISEUR.name(), RoleCode.OPERATEUR.name());

    private final CampaignRepository campaignRepository;

    /** Staff (ADMINISTRATEUR, SUPERVISEUR, OPERATEUR) reads any campaign; an ANNONCEUR only reads their own. */
    public Campaign readable(Long campaignId) {
        UserDetailsImpl user = currentUser();
        Campaign campaign = find(campaignId);
        if (user != null && STAFF.contains(user.getRoleCode())) {
            return campaign;
        }
        if (isOwner(user, campaign)) {
            return campaign;
        }
        throw CampaignErrors.campaignNotFound();
    }

    /** Only the owning ANNONCEUR. */
    public Campaign owned(Long campaignId) {
        UserDetailsImpl user = currentUser();
        Campaign campaign = find(campaignId);
        if (isOwner(user, campaign)) {
            return campaign;
        }
        throw CampaignErrors.campaignNotFound();
    }

    private Campaign find(Long campaignId) {
        if (campaignId == null) {
            throw CampaignErrors.campaignNotFound();
        }
        return campaignRepository.findById(campaignId).orElseThrow(CampaignErrors::campaignNotFound);
    }

    private static boolean isOwner(UserDetailsImpl user, Campaign campaign) {
        return user != null
                && RoleCode.ANNONCEUR.name().equals(user.getRoleCode())
                && campaign.getClient() != null
                && campaign.getClient().getUser() != null
                && Objects.equals(campaign.getClient().getUser().getId(), user.getId());
    }

    static UserDetailsImpl currentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserDetailsImpl user) {
            return user;
        }
        return null;
    }
}
