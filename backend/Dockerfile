FROM eclipse-temurin:21-jdk@sha256:89b79b86b989519a440f71bff294ac4c0498c5fed46810d535a4f3472913d90b AS build
WORKDIR /app
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN sed -i 's/\r$//' gradlew && chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null
COPY src src
RUN ./gradlew --no-daemon bootJar

FROM eclipse-temurin:21-jre@sha256:ff92a063dac03a29fca3987bcfc66aa5f17769542df802bbf7d2ebaba4df8ebe
WORKDIR /app
RUN useradd --system --uid 1001 dropzone
COPY --from=build /app/build/libs/*.jar app.jar
USER dropzone
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
