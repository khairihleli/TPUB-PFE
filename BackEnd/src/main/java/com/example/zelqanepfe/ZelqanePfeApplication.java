package com.example.zelqanepfe;

import com.example.zelqanepfe.config.ZelqaneProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(ZelqaneProperties.class)
public class ZelqanePfeApplication {

    public static void main(String[] args) {
        SpringApplication.run(ZelqanePfeApplication.class, args);
    }
}
