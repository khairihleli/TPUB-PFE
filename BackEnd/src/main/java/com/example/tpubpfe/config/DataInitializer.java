package com.example.tpubpfe.config;

import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        if (userRepository.existsByEmail("admin@tpub.local")) {
            return;
        }
        roleRepository.findByCode(RoleCode.ADMINISTRATEUR).ifPresent(role -> {
            User admin = User.builder()
                    .email("admin@tpub.local")
                    .passwordHash(passwordEncoder.encode("Admin@123"))
                    .role(role)
                    .nom("Administrateur TPUB")
                    .societe("Tukhnanutha")
                    .isActive(true)
                    .build();
            userRepository.save(admin);
            log.info("Default admin user created: admin@tpub.local / Admin@123");
        });
    }
}
