package com.example.zelqanepfe.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/** Registers {@link AiAnalysisProperties} (docs/round2-contract.md §2.1). */
@Configuration
@EnableConfigurationProperties(AiAnalysisProperties.class)
public class AiAnalysisConfig {
}
