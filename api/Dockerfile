# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Resolve dependencies first — this layer is cached unless pom.xml changes
COPY pom.xml .
RUN mvn dependency:go-offline -q

COPY src ./src
RUN mvn package -DskipTests -q

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Non-root user — never run as root in production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

COPY --from=build /app/target/*.jar app.jar

# These are declared here for documentation only.
# The actual values are injected at runtime by Cloud Run — never baked into the image.
ENV MONGODB_URI=""
ENV GOOGLE_CLIENT_ID=""
ENV ALLOWED_ORIGINS=""

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]
