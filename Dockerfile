FROM eclipse-temurin:17-jdk

WORKDIR /app

COPY src/ ./src/

RUN javac src/website.java src/Main.java -d out/

EXPOSE 8000

CMD ["java", "-cp", "out", "Main"]
