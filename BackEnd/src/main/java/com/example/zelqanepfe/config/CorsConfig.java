package com.example.zelqanepfe.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
public class CorsConfig {

    private final ZelqaneProperties zelqaneProperties;

    public CorsConfig(ZelqaneProperties zelqaneProperties) {
        this.zelqaneProperties = zelqaneProperties;
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        List<String> origins = zelqaneProperties.getCors().getAllowedOrigins();
        if (origins == null || origins.isEmpty()) {
            origins = List.of("http://localhost:3000", "http://localhost:4200");
        } else if (origins.size() == 1 && origins.get(0).contains(",")) {
            origins = List.of(origins.get(0).split(","));
        }
        configuration.setAllowedOrigins(origins.stream().map(String::trim).filter(o -> !o.isEmpty()).toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Content-Disposition"));
        configuration.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
