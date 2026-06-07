use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
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
        .route("/v1/repos", get(list_repos))
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
    let user_id = auth_user(&st.db, &headers).await?;

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

// ---- GET /v1/repos : per-repo rollups for the dashboard -------------------

/// Blended Claude Opus price, USD per 1M tokens. Authoritative here so the
/// frontend never has to know pricing (issue #2).
struct Price;
impl Price {
    const INPUT: f64 = 5.0;
    const OUTPUT: f64 = 25.0;
    const CACHE_READ: f64 = 0.5;
    const CACHE_WRITE: f64 = 6.25;
}

#[derive(Deserialize)]
struct ReposQuery {
    /// Time window: `24h`, `7d`, `30d`, or `all`. Defaults to `30d`.
    since: Option<String>,
    /// Max repos returned (1..=500, default 100).
    limit: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct RepoRow {
    repo: String,
    sessions: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
    last_active: DateTime<Utc>,
}

#[derive(Serialize)]
struct RepoOut {
    repo: String,
    sessions: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
    total_tokens: i64,
    estimated_cost_usd: f64,
    last_active: DateTime<Utc>,
}

#[derive(Serialize)]
struct ReposResponse {
    since: String,
    repos: Vec<RepoOut>,
}

async fn list_repos(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReposQuery>,
) -> Result<Json<ReposResponse>, (StatusCode, String)> {
    let user_id = auth_user(&st.db, &headers).await?;

    let since_label = q.since.unwrap_or_else(|| "30d".to_string());
    let cutoff = parse_since(&since_label)
        .ok_or((StatusCode::BAD_REQUEST, "invalid `since` (use 24h|7d|30d|all)".to_string()))?;
    let limit = q.limit.unwrap_or(100).clamp(1, 500);

    let rows: Vec<RepoRow> = sqlx::query_as(
        r#"
        select
            repo,
            count(*)::bigint                                   as sessions,
            coalesce(sum(input_tokens), 0)::bigint             as input_tokens,
            coalesce(sum(output_tokens), 0)::bigint            as output_tokens,
            coalesce(sum(cache_read_input_tokens), 0)::bigint  as cache_read_tokens,
            coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_tokens,
            max(ended_at)                                      as last_active
        from token_logs
        where user_id = $1
          and ($2::timestamptz is null or ended_at >= $2)
        group by repo
        order by last_active desc
        limit $3
        "#,
    )
    .bind(user_id)
    .bind(cutoff)
    .bind(limit)
    .fetch_all(&st.db)
    .await
    .map_err(internal)?;

    let repos = rows
        .into_iter()
        .map(|r| {
            let cost = (r.input_tokens as f64 * Price::INPUT
                + r.output_tokens as f64 * Price::OUTPUT
                + r.cache_read_tokens as f64 * Price::CACHE_READ
                + r.cache_creation_tokens as f64 * Price::CACHE_WRITE)
                / 1_000_000.0;
            RepoOut {
                total_tokens: r.input_tokens
                    + r.output_tokens
                    + r.cache_read_tokens
                    + r.cache_creation_tokens,
                estimated_cost_usd: (cost * 100.0).round() / 100.0,
                repo: r.repo,
                sessions: r.sessions,
                input_tokens: r.input_tokens,
                output_tokens: r.output_tokens,
                cache_read_tokens: r.cache_read_tokens,
                cache_creation_tokens: r.cache_creation_tokens,
                last_active: r.last_active,
            }
        })
        .collect();

    Ok(Json(ReposResponse { since: since_label, repos }))
}

/// Resolve a `since` label to an optional cutoff timestamp. `all` → None.
/// Returns None for *invalid* input (caller turns that into 400).
fn parse_since(label: &str) -> Option<Option<DateTime<Utc>>> {
    if label == "all" {
        return Some(None);
    }
    let (num, unit) = label.split_at(label.len().saturating_sub(1));
    let n: i64 = num.parse().ok()?;
    if n < 0 {
        return None;
    }
    let dur = match unit {
        "h" => Duration::hours(n),
        "d" => Duration::days(n),
        _ => return None,
    };
    Some(Some(Utc::now() - dur))
}

/// Shared Bearer-key → user_id resolution.
async fn auth_user(
    db: &PgPool,
    headers: &HeaderMap,
) -> Result<uuid::Uuid, (StatusCode, String)> {
    let key = bearer(headers)
        .ok_or((StatusCode::UNAUTHORIZED, "missing bearer token".to_string()))?;
    sqlx::query_scalar("select user_id from api_keys where key = $1 and revoked_at is null")
        .bind(&key)
        .fetch_optional(db)
        .await
        .map_err(internal)?
        .ok_or((StatusCode::UNAUTHORIZED, "invalid api key".to_string()))
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
