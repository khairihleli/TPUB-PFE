package com.example.zelqanepfe.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CampaignZonesUpdateResponse {
    private List<CampaignZoneResponse> zones;
    private List<Long> cancelledReservationIds;
}
