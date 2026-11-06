# Build the React frontend
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Compile the Java backend (JDK only, no dependencies)
FROM eclipse-temurin:21-jdk-alpine AS api
WORKDIR /api
COPY backend/src ./src
RUN mkdir out && javac -d out src/main/java/garage/*.java

# Small runtime image
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=api /api/out ./out
COPY --from=web /web/dist ./static
ENV HOST=0.0.0.0 \
    PORT=8080 \
    STATIC_DIR=/app/static \
    DATA_FILE=/data/users.tsv \
    GARAGES_FILE=/data/garages.json \
    SEED_SAMPLES=false
# Accounts and garages live here: mount a persistent volume or they are lost when the container is replaced.
VOLUME /data
EXPOSE 8080
CMD ["java", "-Xmx256m", "-cp", "out", "garage.Main"]
