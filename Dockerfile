# Multi-stage build for the tokenmoth ingestion API.
# Migrations are embedded at compile time via sqlx::migrate!, so the runtime
# image needs only the binary + CA certs.
FROM rust:1-bookworm AS build
WORKDIR /app
COPY backend/ .
RUN cargo build --release -p tokenmoth-api

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/tokenmoth-api /usr/local/bin/tokenmoth-api
ENV BIND_ADDR=0.0.0.0:8080
EXPOSE 8080
CMD ["tokenmoth-api"]
