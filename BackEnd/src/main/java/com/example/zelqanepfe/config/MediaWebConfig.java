package com.example.zelqanepfe.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Serves uploaded files under {@code /uploads/**} (contract §2.3). Range requests are handled by Spring's
 * {@code ResourceHttpRequestHandler}. Round 2: access and caching are decided by
 * {@link com.example.zelqanepfe.security.SignedMediaFilter} (signed URL, {@code Cache-Control: private}); the former
 * public one-day cache is gone.
 */
@Configuration
@RequiredArgsConstructor
public class MediaWebConfig implements WebMvcConfigurer {

    private final ZelqaneProperties properties;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String dir = properties.getMedia().getUploadDir() == null ? "./uploads" : properties.getMedia().getUploadDir();
        Path root = Paths.get(dir).toAbsolutePath().normalize();
        String location = root.toUri().toString();
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(location.endsWith("/") ? location : location + "/");
    }
}
