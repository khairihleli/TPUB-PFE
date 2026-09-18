package com.example.zelqanepfe.security;

import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers the early {@code @PreAuthorize} check on every controller route, preceded by the forced password
 * change guard (round 2).
 */
@Configuration
public class SecurityWebMvcConfig implements WebMvcConfigurer {

    private final ApplicationContext applicationContext;

    public SecurityWebMvcConfig(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new PasswordChangeRequiredInterceptor());
        registry.addInterceptor(new PreAuthorizeHandlerInterceptor(applicationContext));
    }
}
