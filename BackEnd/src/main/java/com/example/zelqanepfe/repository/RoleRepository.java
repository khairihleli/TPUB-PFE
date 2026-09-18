package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.Role;
import com.example.zelqanepfe.model.RoleCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoleRepository extends JpaRepository<Role, Long> {

    Optional<Role> findByCode(RoleCode code);

    List<Role> findAllByOrderByIdAsc();
}
