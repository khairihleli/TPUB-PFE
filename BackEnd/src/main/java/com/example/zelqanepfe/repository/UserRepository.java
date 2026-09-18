package com.example.zelqanepfe.repository;

import com.example.zelqanepfe.model.RoleCode;
import com.example.zelqanepfe.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    /** Case-insensitive lookup; a list because legacy data may hold e-mails differing only by case. */
    List<User> findAllByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    @Query("SELECT COUNT(u) FROM User u WHERE u.role.code = :code AND u.isActive = true")
    long countActiveByRoleCode(@Param("code") RoleCode code);
}
