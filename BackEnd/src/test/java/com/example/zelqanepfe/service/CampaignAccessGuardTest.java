package com.example.zelqanepfe.service;

import com.example.zelqanepfe.exception.ApiException;
import com.example.zelqanepfe.model.Campaign;
import com.example.zelqanepfe.model.Client;
import com.example.zelqanepfe.model.User;
import com.example.zelqanepfe.repository.CampaignRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CampaignAccessGuardTest {

    private CampaignRepository repository;
    private CampaignAccessGuard guard;
    private Campaign campaign;

    @BeforeEach
    void setUp() {
        repository = mock(CampaignRepository.class);
        guard = new CampaignAccessGuard(repository);
        User owner = User.builder().id(10L).build();
        campaign = Campaign.builder().id(1L).client(Client.builder().id(5L).user(owner).build()).build();
        when(repository.findById(1L)).thenReturn(Optional.of(campaign));
        when(repository.findById(2L)).thenReturn(Optional.empty());
    }

    @AfterEach
    void tearDown() {
        TestAuth.logout();
    }

    @Test
    void ownerReadsAndOwnsTheirCampaign() {
        TestAuth.login(10L, "ANNONCEUR");
        assertThat(guard.readable(1L)).isSameAs(campaign);
        assertThat(guard.owned(1L)).isSameAs(campaign);
    }

    @Test
    void otherAdvertiserGets404() {
        TestAuth.login(11L, "ANNONCEUR");
        assertNotFound(() -> guard.readable(1L));
        assertNotFound(() -> guard.owned(1L));
    }

    @Test
    void staffReadsButDoesNotOwn() {
        for (String role : new String[]{"ADMINISTRATEUR", "SUPERVISEUR", "OPERATEUR"}) {
            TestAuth.login(1L, role);
            assertThat(guard.readable(1L)).isSameAs(campaign);
            assertNotFound(() -> guard.owned(1L));
        }
    }

    @Test
    void unknownCampaignOrAnonymousGets404() {
        TestAuth.login(10L, "ANNONCEUR");
        assertNotFound(() -> guard.readable(2L));
        TestAuth.logout();
        assertNotFound(() -> guard.readable(1L));
    }

    private static void assertNotFound(org.assertj.core.api.ThrowableAssert.ThrowingCallable call) {
        assertThatThrownBy(call)
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> {
                    assertThat(((ApiException) ex).getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
                    assertThat(((ApiException) ex).getCode()).isEqualTo("CAMPAIGN_NOT_FOUND");
                });
    }
}
