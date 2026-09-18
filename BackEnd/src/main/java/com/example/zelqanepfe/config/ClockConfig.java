package com.example.zelqanepfe.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class ClockConfig {

    @Bean
    public Clock clock(ZelqaneProperties p) {
        return Clock.system(ZoneId.of(p.getTimezone()));
    }
}
