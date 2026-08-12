package com.example.tpubpfe.service;

import com.example.tpubpfe.dto.AuthResponse;
import com.example.tpubpfe.dto.LoginRequest;
import com.example.tpubpfe.dto.RegisterRequest;
import com.example.tpubpfe.exception.BadRequestException;
import com.example.tpubpfe.model.Client;
import com.example.tpubpfe.model.RoleCode;
import com.example.tpubpfe.model.User;
import com.example.tpubpfe.repository.ClientRepository;
import com.example.tpubpfe.repository.RoleRepository;
import com.example.tpubpfe.repository.UserRepository;
import com.example.tpubpfe.security.JwtService;
import com.example.tpubpfe.security.UserDetailsImpl;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final ClientRepository clientRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }

        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(roleRepository.findByCode(RoleCode.ANNONCEUR)
                        .orElseThrow(() -> new BadRequestException("Annonceur role not found")))
                .nom(request.getNom())
                .societe(request.getSociete())
                .telephone(request.getTelephone())
                .adresse(request.getAdresse())
                .isActive(true)
                .build();

        user = userRepository.save(user);

        Client client = Client.builder()
                .user(user)
                .companyName(request.getSociete())
                .build();
        clientRepository.save(client);

        UserDetailsImpl userDetails = UserDetailsImpl.fromUser(user);
        String token = jwtService.generateToken(userDetails);

        return AuthResponse.builder()
                .token(token)
                .email(user.getEmail())
                .nom(user.getNom())
                .role(user.getRole().getCode().name())
                .userId(user.getId())
                .build();
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword())
        );

        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new BadRequestException("User not found"));

        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        UserDetailsImpl userDetails = UserDetailsImpl.fromUser(user);
        String token = jwtService.generateToken(userDetails);

        return AuthResponse.builder()
                .token(token)
                .email(user.getEmail())
                .nom(user.getNom())
                .role(user.getRole().getCode().name())
                .userId(user.getId())
                .build();
    }
}
