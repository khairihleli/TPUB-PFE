package com.example.tpubpfe;

import com.example.tpubpfe.config.TpubProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(TpubProperties.class)
public class TpubPfeApplication {

    public static void main(String[] args) {
        SpringApplication.run(TpubPfeApplication.class, args);
    }
}
