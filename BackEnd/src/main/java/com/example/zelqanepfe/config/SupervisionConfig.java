package com.example.zelqanepfe.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Registers the lane L4 properties (docs/round2-contract.md §5.1). The executors of realtime broadcasting and notification mail are owned by the components that use
 * them (no {@code Executor} bean, so Spring Boot keeps its own task executor). The approval and mail settings also honour the short environment names of the contract
 * ({@code ZELQANE_EMERGENCY_APPROVALS}, {@code ZELQANE_CAMPAIGN_APPROVALS}, {@code ZELQANE_CAMPAIGN_APPROVAL_RISK},
 * {@code ZELQANE_MAIL_FROM}, {@code ZELQANE_PUBLIC_URL}); an explicit {@code zelqane.*} key still wins.
 */
@Configuration
@EnableConfigurationProperties(SupervisionProperties.Supervision.class)
public class SupervisionConfig {

    @Bean
    @ConfigurationProperties(prefix = "zelqane.approval")
    public SupervisionProperties.Approval approvalProperties(Environment environment) {
        SupervisionProperties.Approval approval = new SupervisionProperties.Approval();
        Integer emergency = environment.getProperty("ZELQANE_EMERGENCY_APPROVALS", Integer.class);
        if (emergency != null) {
            approval.setEmergencyRequiredApprovals(emergency);
        }
        Integer campaign = environment.getProperty("ZELQANE_CAMPAIGN_APPROVALS", Integer.class);
        if (campaign != null) {
            approval.setCampaignRequiredApprovals(campaign);
        }
        Integer risk = environment.getProperty("ZELQANE_CAMPAIGN_APPROVAL_RISK", Integer.class);
        if (risk != null) {
            approval.setCampaignRiskThreshold(risk);
        }
        return approval;
    }

    @Bean
    @ConfigurationProperties(prefix = "zelqane.notifications")
    public SupervisionProperties.Notifications notificationProperties(Environment environment) {
        SupervisionProperties.Notifications notifications = new SupervisionProperties.Notifications();
        String from = environment.getProperty("ZELQANE_MAIL_FROM");
        if (from != null) {
            notifications.getMail().setFrom(from);
        }
        String baseUrl = environment.getProperty("ZELQANE_PUBLIC_URL");
        if (baseUrl != null && !baseUrl.isBlank()) {
            notifications.getMail().setBaseUrl(baseUrl);
        }
        return notifications;
    }
}
