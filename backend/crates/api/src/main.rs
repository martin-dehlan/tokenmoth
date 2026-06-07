use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

#[derive(Clone)]
struct AppState {
    db: PgPool,
}

/// Payload built by `tokenrat report` (NOT the raw Claude Code hook payload —
/// the hook payload carries no token counts; the CLI aggregates them from the
/// session transcript before POSTing here). See AUDIT.md, finding 1.
#[derive(Deserialize)]
struct Telemetry {
    session_id: String,
    project_path: String,
    #[serde(default)]
    repo: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    input_tokens: i64,
    #[serde(default)]
    output_tokens: i64,
    #[serde(default)]
    cache_read_input_tokens: i64,
    #[serde(default)]
    cache_creation_input_tokens: i64,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tokenrat_api=info,tower_http=info".into()),
        )
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await?;

    sqlx::migrate!("../../migrations").run(&db).await?;

    let state = AppState { db };
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/v1/telemetry", post(ingest))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".into())
        .parse()?;
    tracing::info!("tokenrat-api listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn ingest(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(t): Json<Telemetry>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Auth via Authorization: Bearer <key> — never via query string (audit finding 3).
    let key = bearer(&headers)
        .ok_or((StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;

    let user_id: uuid::Uuid =
        sqlx::query_scalar("select user_id from api_keys where key = $1 and revoked_at is null")
            .bind(&key)
            .fetch_optional(&st.db)
            .await
            .map_err(internal)?
            .ok_or((StatusCode::UNAUTHORIZED, "invalid api key".to_string()))?;

    let repo = t
        .repo
        .clone()
        .filter(|r| !r.is_empty())
        .unwrap_or_else(|| repo_from_path(&t.project_path));

    // Idempotent per session_id (audit finding 5): re-fired SessionEnd updates
    // the row instead of double-counting cost.
    sqlx::query(
        r#"
        insert into token_logs
          (user_id, session_id, repo, project_path, input_tokens, output_tokens,
           cache_read_input_tokens, cache_creation_input_tokens, model)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (session_id) do update set
           input_tokens                = excluded.input_tokens,
           output_tokens               = excluded.output_tokens,
           cache_read_input_tokens     = excluded.cache_read_input_tokens,
           cache_creation_input_tokens = excluded.cache_creation_input_tokens,
           repo                         = excluded.repo,
           model                        = excluded.model,
           ended_at                     = now()
        "#,
    )
    .bind(user_id)
    .bind(&t.session_id)
    .bind(&repo)
    .bind(&t.project_path)
    .bind(t.input_tokens)
    .bind(t.output_tokens)
    .bind(t.cache_read_input_tokens)
    .bind(t.cache_creation_input_tokens)
    .bind(&t.model)
    .execute(&st.db)
    .await
    .map_err(internal)?;

    Ok(StatusCode::ACCEPTED)
}

fn bearer(h: &HeaderMap) -> Option<String> {
    h.get("authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(|s| s.to_string())
}

fn repo_from_path(p: &str) -> String {
    p.trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("unknown")
        .to_string()
}

fn internal<E: std::fmt::Display>(e: E) -> (StatusCode, String) {
    (StatusCode::INTERNAL_SERVER_ERROR, e.to_string())
}
