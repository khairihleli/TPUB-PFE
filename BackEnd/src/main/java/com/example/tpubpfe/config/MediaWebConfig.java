package com.example.tpubpfe.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.TimeUnit;

/**
 * Serves uploaded files publicly under {@code /uploads/**} (contract §2.3). Range requests are handled by
 * Spring's {@code ResourceHttpRequestHandler}.
 */
@Configuration
@RequiredArgsConstructor
public class MediaWebConfig implements WebMvcConfigurer {

    private final TpubProperties properties;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String dir = properties.getMedia().getUploadDir() == null ? "./uploads" : properties.getMedia().getUploadDir();
        Path root = Paths.get(dir).toAbsolutePath().normalize();
        String location = root.toUri().toString();
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(location.endsWith("/") ? location : location + "/")
                .setCacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePublic());
    }
}
