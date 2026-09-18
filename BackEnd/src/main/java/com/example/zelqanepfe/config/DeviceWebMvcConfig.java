package com.example.zelqanepfe.config;

import com.example.zelqanepfe.security.device.DeviceKeyInterceptor;
import com.example.zelqanepfe.security.device.DeviceRateLimiter;
import com.example.zelqanepfe.service.DeviceKeyService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.time.Clock;

/** Guards the three player routes with the device key (docs/round2-contract.md §1.1, §3.4). */
@Configuration
public class DeviceWebMvcConfig implements WebMvcConfigurer {

    static final String[] DEVICE_PATHS = {
            "/api/diffusion/next",
            "/api/diffusion/interactions",
            "/api/diffusion/heartbeat"
    };

    private final DeviceKeyService deviceKeyService;
    private final ZelqaneProperties properties;
    private final Clock clock;

    public DeviceWebMvcConfig(DeviceKeyService deviceKeyService, ZelqaneProperties properties, Clock clock) {
        this.deviceKeyService = deviceKeyService;
        this.properties = properties;
        this.clock = clock;
    }

    @Bean
    public DeviceRateLimiter deviceRateLimiter() {
        ZelqaneProperties.Device device = properties.getDevice();
        return new DeviceRateLimiter(device.getRateLimit().getPerMinute(), device.getRateLimit().getBurst(),
                device.getInvalidKeyPerMinutePerIp(), clock::millis);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new DeviceKeyInterceptor(deviceKeyService, deviceRateLimiter()))
                .addPathPatterns(DEVICE_PATHS)
                .order(Ordered.HIGHEST_PRECEDENCE);
    }
}
