package com.example.tpubpfe.repository;

import com.example.tpubpfe.model.Role;
import com.example.tpubpfe.model.RoleCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long> {

    Optional<Role> findByCode(RoleCode code);
}
