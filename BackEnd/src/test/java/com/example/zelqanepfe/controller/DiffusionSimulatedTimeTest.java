package com.example.zelqanepfe.controller;

import com.example.zelqanepfe.config.ZelqaneProperties;
import com.example.zelqanepfe.dto.DiffusionResponse;
import com.example.zelqanepfe.service.DiffusionLogQueryService;
import com.example.zelqanepfe.service.DiffusionService;
import com.example.zelqanepfe.service.InteractionService;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The {@code datetime} parameter of the player is honoured only when
 * {@code zelqane.diffusion.simulated-time-enabled} is true (docs/round2-contract.md §3.3): everywhere else the
 * server clock decides, so a paired screen cannot replay or anticipate a campaign.
 */
class DiffusionSimulatedTimeTest {

    private static final LocalDateTime REQUESTED = LocalDateTime.parse("2030-01-10T10:00:00");

    private final DiffusionService diffusionService = mock(DiffusionService.class);

    private DiffusionController controller(boolean simulatedTimeEnabled) {
        ZelqaneProperties properties = new ZelqaneProperties();
        properties.getDiffusion().setSimulatedTimeEnabled(simulatedTimeEnabled);
        when(diffusionService.getNextAd(any(), any(), any())).thenReturn(new DiffusionResponse());
        return new DiffusionController(diffusionService, mock(InteractionService.class),
                mock(DiffusionLogQueryService.class), properties);
    }

    @Test
    void datetimeIsIgnoredWhenSimulatedTimeIsDisabled() {
        DiffusionResponse response = controller(false).getNext(7L, null, REQUESTED).getBody();

        verify(diffusionService).getNextAd(eq(7L), isNull(), isNull());
        assertThat(response).isNotNull();
        assertThat(response.isSimulatedTime()).isFalse();
    }

    @Test
    void datetimeIsHonouredWhenSimulatedTimeIsEnabled() {
        DiffusionResponse response = controller(true).getNext(7L, null, REQUESTED).getBody();

        verify(diffusionService).getNextAd(eq(7L), isNull(), eq(REQUESTED));
        assertThat(response).isNotNull();
        assertThat(response.isSimulatedTime()).isTrue();
    }

    @Test
    void withoutDatetimeTheServerClockIsUsedEvenWhenSimulationIsEnabled() {
        DiffusionResponse response = controller(true).getNext(7L, "Tunis Centre", null).getBody();

        verify(diffusionService).getNextAd(eq(7L), eq("Tunis Centre"), isNull());
        assertThat(response).isNotNull();
        assertThat(response.isSimulatedTime()).isFalse();
    }
}
