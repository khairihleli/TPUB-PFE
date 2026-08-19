# syntax=docker/dockerfile:1
# =============================================================================
# TPUB Backend — Multi-stage Docker build
# Stage 1: Maven build  |  Stage 2: JRE runtime (eclipse-temurin 21 Alpine)
# =============================================================================

# --- Build stage -------------------------------------------------------------
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder

WORKDIR /app

# Layer 1 — dependencies only (re-runs when pom.xml changes, NOT when src/ changes)
COPY pom.xml .
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -q \
    org.apache.maven.plugins:maven-dependency-plugin:3.8.1:go-offline \
    -DskipTests

# Layer 2 — compile & package (deps already in ~/.m2 cache mount)
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -ntp -q package -DskipTests

# --- Runtime stage ------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

LABEL org.opencontainers.image.title="TPUB Backend"
LABEL org.opencontainers.image.description="TPUB intelligent advertising platform — Spring Boot API"

RUN addgroup -S tpub && adduser -S tpub -G tpub

WORKDIR /app

RUN mkdir -p /app/uploads && chown -R tpub:tpub /app

RUN apk add --no-cache curl

COPY --from=builder --chown=tpub:tpub /app/target/BackEnd-*.jar app.jar

USER tpub

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
