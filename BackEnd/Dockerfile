# =============================================================================
# TPUB Backend — Multi-stage Docker build
# Stage 1: Maven build  |  Stage 2: JRE runtime (eclipse-temurin 21 Alpine)
# =============================================================================

# --- Build stage -------------------------------------------------------------
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /app

# Install Maven (not bundled in temurin JRE/JDK slim images)
RUN apk add --no-cache maven

# Cache dependency layer: copy POM first so source changes don't bust deps
COPY pom.xml .
COPY .mvn/ .mvn/
COPY mvnw mvnw.cmd ./

RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Copy source and build the fat JAR (skip tests in container build)
COPY src/ src/
RUN ./mvnw clean package -DskipTests -B

# --- Runtime stage ------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine AS runtime

LABEL org.opencontainers.image.title="TPUB Backend"
LABEL org.opencontainers.image.description="TPUB intelligent advertising platform — Spring Boot API"

# Non-root user for security
RUN addgroup -S tpub && adduser -S tpub -G tpub

WORKDIR /app

# Create upload directory with correct ownership
RUN mkdir -p /app/uploads && chown -R tpub:tpub /app

# Runtime utilities for container health probing
RUN apk add --no-cache curl

COPY --from=builder --chown=tpub:tpub /app/target/*.jar app.jar

USER tpub

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
