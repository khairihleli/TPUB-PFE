package com.example.tpubpfe.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * Registers the lane L3 properties (docs/round2-contract.md §4.1) and honours the documented environment alias
 * {@code TPUB_DYNAMIC_PRICING_ENABLED} when {@code tpub.pricing.dynamic.enabled} is not set explicitly.
 */
@Configuration
@EnableConfigurationProperties({GeoPricingProperties.Geo.class, GeoPricingProperties.Dynamic.class})
public class GeoPricingConfig {

    static final String ENABLED_ENV = "TPUB_DYNAMIC_PRICING_ENABLED";

    public GeoPricingConfig(GeoPricingProperties.Dynamic dynamic, Environment environment) {
        applyEnabledAlias(dynamic, environment);
    }

    static void applyEnabledAlias(GeoPricingProperties.Dynamic dynamic, Environment environment) {
        if (environment.containsProperty("tpub.pricing.dynamic.enabled")) {
            return;
        }
        String alias = environment.getProperty(ENABLED_ENV);
        if (alias != null && !alias.isBlank()) {
            dynamic.setEnabled(Boolean.parseBoolean(alias.trim()));
        }
    }
}
