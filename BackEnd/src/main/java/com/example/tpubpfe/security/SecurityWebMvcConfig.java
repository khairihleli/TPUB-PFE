package com.example.tpubpfe.security;

import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/** Registers the early {@code @PreAuthorize} check on every controller route. */
@Configuration
public class SecurityWebMvcConfig implements WebMvcConfigurer {

    private final ApplicationContext applicationContext;

    public SecurityWebMvcConfig(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new PreAuthorizeHandlerInterceptor(applicationContext));
    }
}
