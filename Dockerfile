# Multi-stage build for the tokenmoth ingestion API.
# Migrations are embedded at compile time via sqlx::migrate!, so the runtime
# image needs only the binary + CA certs.
FROM rust:1-bookworm AS build
WORKDIR /app
COPY backend/ .
RUN cargo build --release -p tokenmoth-api

FROM debian:bookworm-slim
# curl is only used by the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --create-home --shell /usr/sbin/nologin app
COPY --from=build /app/target/release/tokenmoth-api /usr/local/bin/tokenmoth-api
ENV BIND_ADDR=0.0.0.0:8080
EXPOSE 8080
# Drop root: the API binds an unprivileged port and writes nothing to disk.
USER app
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1
CMD ["tokenmoth-api"]
