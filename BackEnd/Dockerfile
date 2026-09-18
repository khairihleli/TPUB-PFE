# syntax=docker/dockerfile:1
# =============================================================================
# ZELQANE Backend — Multi-stage Docker build
# Stage 1: Maven build  |  Stage 2: tessdata download  |  Stage 3: JRE runtime (eclipse-temurin 21, Ubuntu Noble)
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

# --- Tesseract data stage (fra, eng, ara · tessdata_fast, SHA-256 verified) ----
FROM alpine:3.20 AS tessdata

RUN apk add --no-cache curl coreutils
COPY scripts/fetch-tessdata.sh scripts/tessdata.sha256 /scripts/
RUN sh /scripts/fetch-tessdata.sh /tessdata

# --- Runtime stage ------------------------------------------------------------
FROM eclipse-temurin:21-jre-noble AS runtime

LABEL org.opencontainers.image.title="ZELQANE Backend"
LABEL org.opencontainers.image.description="ZELQANE intelligent advertising platform — Spring Boot API"

# Native Tesseract for Tess4J (OCR); JNA looks for libtesseract.so
RUN apt-get update \
    && apt-get install -y --no-install-recommends libtesseract5 curl ca-certificates \
    && ln -sf /usr/lib/x86_64-linux-gnu/libtesseract.so.5 /usr/lib/x86_64-linux-gnu/libtesseract.so \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system zelqane && useradd --system --gid zelqane --home-dir /app zelqane

WORKDIR /app

RUN mkdir -p /app/uploads && chown -R zelqane:zelqane /app

COPY --from=tessdata --chown=zelqane:zelqane /tessdata /app/tessdata
COPY --from=builder --chown=zelqane:zelqane /app/target/BackEnd-*.jar app.jar

ENV ZELQANE_OCR_TESSDATA=/app/tessdata

USER zelqane

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

ENTRYPOINT ["java", \
  "-XX:+UseContainerSupport", \
  "-XX:MaxRAMPercentage=75.0", \
  "-Djava.security.egd=file:/dev/./urandom", \
  "-jar", "app.jar"]
