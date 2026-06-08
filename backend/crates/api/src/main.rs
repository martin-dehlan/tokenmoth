use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

/// Max telemetry body size. A real session payload is well under 1 KB.
const MAX_BODY_BYTES: usize = 16 * 1024;

#[derive(Clone)]
struct AppState {
    db: PgPool,
    rate: Arc<RateLimiter>,
}

/// Per-key token-bucket rate limiter (in-memory). Smooths bursts and caps a
/// runaway hook from flooding ingest. Keyed by API key.
struct RateLimiter {
    capacity: f64,
    refill_per_sec: f64,
    buckets: Mutex<HashMap<String, (f64, Instant)>>,
}

impl RateLimiter {
    fn per_minute(rpm: f64) -> Self {
        Self {
            capacity: rpm.max(1.0),
            refill_per_sec: rpm.max(1.0) / 60.0,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    /// Returns true if a request is allowed (and consumes one token).
    fn check(&self, key: &str, now: Instant) -> bool {
        let mut b = self.buckets.lock().unwrap();
        let entry = b.entry(key.to_string()).or_insert((self.capacity, now));
        let elapsed = now.saturating_duration_since(entry.1).as_secs_f64();
        entry.0 = (entry.0 + elapsed * self.refill_per_sec).min(self.capacity);
        entry.1 = now;
        if entry.0 >= 1.0 {
            entry.0 -= 1.0;
            true
        } else {
            false
        }
    }
}

/// Payload built by `tokenmoth report` (NOT the raw Claude Code hook payload —
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
                .unwrap_or_else(|_| "tokenmoth_api=info,tower_http=info".into()),
        )
        .init();

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await?;

    sqlx::migrate!("../../migrations").run(&db).await?;

    // Optional single-user bootstrap: self-seed a user + API key on startup so a
    // fresh deploy (e.g. docker-compose) is usable immediately. Idempotent.
    if let Ok(key) = std::env::var("TOKENMOTH_BOOTSTRAP_KEY") {
        if !key.is_empty() {
            let email = std::env::var("TOKENMOTH_BOOTSTRAP_EMAIL")
                .unwrap_or_else(|_| "me@tokenmoth.local".to_string());
            bootstrap_key(&db, &key, &email).await?;
            tracing::info!("bootstrapped api key for {email}");
        }
    }

    let rpm: f64 = std::env::var("TOKENMOTH_RATE_PER_MIN")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(120.0);

    let state = AppState {
        db,
        rate: Arc::new(RateLimiter::per_minute(rpm)),
    };
    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/v1/telemetry", post(ingest))
        .route("/v1/repos", get(list_repos))
        .route("/v1/repos/:name/series", get(repo_series))
        .route("/v1/series", get(account_series))
        .route("/v1/keys", get(list_keys).post(create_key))
        .route("/v1/keys/:id/revoke", post(revoke_key))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".into())
        .parse()?;
    tracing::info!("tokenmoth-api listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

/// Idempotently ensure a user + API key exist (single-user bootstrap).
async fn bootstrap_key(db: &PgPool, key: &str, email: &str) -> anyhow::Result<()> {
    let user_id: uuid::Uuid = sqlx::query_scalar(
        "insert into users (email) values ($1)
         on conflict (email) do update set email = excluded.email
         returning id",
    )
    .bind(email)
    .fetch_one(db)
    .await?;
    sqlx::query(
        "insert into api_keys (key, user_id, label) values ($1, $2, 'bootstrap')
         on conflict (key) do nothing",
    )
    .bind(key)
    .bind(user_id)
    .execute(db)
    .await?;
    Ok(())
}

async fn ingest(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(t): Json<Telemetry>,
) -> Result<StatusCode, (StatusCode, String)> {
    // Rate-limit before the DB hit (also throttles unauthenticated floods).
    let key = bearer(&headers).unwrap_or_default();
    let bucket = if key.is_empty() { "anon" } else { key.as_str() };
    if !st.rate.check(bucket, Instant::now()) {
        return Err((StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded".to_string()));
    }

    // Auth via Authorization: Bearer <key> — never via query string (audit finding 3).
    let user_id = auth_user(&st.db, &headers).await?;

    // Validate payload (audit finding 1: never trust client-supplied counts blindly).
    if t.session_id.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "session_id is required".to_string()));
    }
    if t.input_tokens < 0
        || t.output_tokens < 0
        || t.cache_read_input_tokens < 0
        || t.cache_creation_input_tokens < 0
    {
        return Err((StatusCode::BAD_REQUEST, "token counts must be non-negative".to_string()));
    }

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

/// Estimated USD cost from raw token sums, rounded to cents.
fn cost_usd(input: i64, output: i64, cache_read: i64, cache_creation: i64) -> f64 {
    let c = (input as f64 * Price::INPUT
        + output as f64 * Price::OUTPUT
        + cache_read as f64 * Price::CACHE_READ
        + cache_creation as f64 * Price::CACHE_WRITE)
        / 1_000_000.0;
    (c * 100.0).round() / 100.0
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
            RepoOut {
                total_tokens: r.input_tokens
                    + r.output_tokens
                    + r.cache_read_tokens
                    + r.cache_creation_tokens,
                estimated_cost_usd: cost_usd(
                    r.input_tokens,
                    r.output_tokens,
                    r.cache_read_tokens,
                    r.cache_creation_tokens,
                ),
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

// ---- GET /v1/repos/:name/series : daily time-series for one repo -----------

#[derive(sqlx::FromRow)]
struct SeriesRow {
    day: NaiveDate,
    sessions: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
}

#[derive(Serialize)]
struct SeriesPoint {
    day: NaiveDate,
    sessions: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
    total_tokens: i64,
    estimated_cost_usd: f64,
}

#[derive(Serialize)]
struct SeriesResponse {
    repo: String,
    since: String,
    points: Vec<SeriesPoint>,
}

async fn repo_series(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(q): Query<ReposQuery>,
) -> Result<Json<SeriesResponse>, (StatusCode, String)> {
    let user_id = auth_user(&st.db, &headers).await?;

    let since_label = q.since.unwrap_or_else(|| "30d".to_string());
    let cutoff = parse_since(&since_label)
        .ok_or((StatusCode::BAD_REQUEST, "invalid `since` (use 24h|7d|30d|all)".to_string()))?;

    let rows: Vec<SeriesRow> = sqlx::query_as(
        r#"
        select
            date_trunc('day', ended_at)::date                  as day,
            count(*)::bigint                                   as sessions,
            coalesce(sum(input_tokens), 0)::bigint             as input_tokens,
            coalesce(sum(output_tokens), 0)::bigint            as output_tokens,
            coalesce(sum(cache_read_input_tokens), 0)::bigint  as cache_read_tokens,
            coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_tokens
        from token_logs
        where user_id = $1
          and repo = $2
          and ($3::timestamptz is null or ended_at >= $3)
        group by day
        order by day asc
        "#,
    )
    .bind(user_id)
    .bind(&name)
    .bind(cutoff)
    .fetch_all(&st.db)
    .await
    .map_err(internal)?;

    let points = rows
        .into_iter()
        .map(|r| SeriesPoint {
            total_tokens: r.input_tokens
                + r.output_tokens
                + r.cache_read_tokens
                + r.cache_creation_tokens,
            estimated_cost_usd: cost_usd(
                r.input_tokens,
                r.output_tokens,
                r.cache_read_tokens,
                r.cache_creation_tokens,
            ),
            day: r.day,
            sessions: r.sessions,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens,
            cache_creation_tokens: r.cache_creation_tokens,
        })
        .collect();

    Ok(Json(SeriesResponse { repo: name, since: since_label, points }))
}

// ---- GET /v1/series : account-wide daily series (all repos) ----------------

#[derive(Serialize)]
struct AccountSeriesResponse {
    since: String,
    points: Vec<SeriesPoint>,
}

async fn account_series(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReposQuery>,
) -> Result<Json<AccountSeriesResponse>, (StatusCode, String)> {
    let user_id = auth_user(&st.db, &headers).await?;

    let since_label = q.since.unwrap_or_else(|| "30d".to_string());
    let cutoff = parse_since(&since_label)
        .ok_or((StatusCode::BAD_REQUEST, "invalid `since` (use 24h|7d|30d|all)".to_string()))?;

    let rows: Vec<SeriesRow> = sqlx::query_as(
        r#"
        select
            date_trunc('day', ended_at)::date                  as day,
            count(*)::bigint                                   as sessions,
            coalesce(sum(input_tokens), 0)::bigint             as input_tokens,
            coalesce(sum(output_tokens), 0)::bigint            as output_tokens,
            coalesce(sum(cache_read_input_tokens), 0)::bigint  as cache_read_tokens,
            coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_tokens
        from token_logs
        where user_id = $1
          and ($2::timestamptz is null or ended_at >= $2)
        group by day
        order by day asc
        "#,
    )
    .bind(user_id)
    .bind(cutoff)
    .fetch_all(&st.db)
    .await
    .map_err(internal)?;

    let points = rows
        .into_iter()
        .map(|r| SeriesPoint {
            total_tokens: r.input_tokens
                + r.output_tokens
                + r.cache_read_tokens
                + r.cache_creation_tokens,
            estimated_cost_usd: cost_usd(
                r.input_tokens,
                r.output_tokens,
                r.cache_read_tokens,
                r.cache_creation_tokens,
            ),
            day: r.day,
            sessions: r.sessions,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens,
            cache_creation_tokens: r.cache_creation_tokens,
        })
        .collect();

    Ok(Json(AccountSeriesResponse { since: since_label, points }))
}

// ---- key management (admin-gated) -----------------------------------------

#[derive(Serialize)]
struct KeyOut {
    id: uuid::Uuid,
    masked: String,
    label: Option<String>,
    created_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
    active: bool,
}

#[derive(sqlx::FromRow)]
struct KeyRow {
    id: uuid::Uuid,
    key: String,
    label: Option<String>,
    created_at: DateTime<Utc>,
    revoked_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
struct CreateKeyReq {
    #[serde(default)]
    label: Option<String>,
}

#[derive(Serialize)]
struct CreatedKey {
    id: uuid::Uuid,
    key: String, // full secret — shown ONCE
    label: Option<String>,
}

/// Show only the shape of a key: `tm_ab12…cd34`.
fn mask_key(k: &str) -> String {
    let body = k.strip_prefix("tm_").unwrap_or(k);
    if body.len() <= 8 {
        return "tm_…".to_string();
    }
    format!("tm_{}…{}", &body[..4], &body[body.len() - 4..])
}

async fn list_keys(
    State(st): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<KeyOut>>, (StatusCode, String)> {
    auth_admin(&headers)?;
    let rows: Vec<KeyRow> = sqlx::query_as(
        "select id, key, label, created_at, revoked_at from api_keys order by created_at desc",
    )
    .fetch_all(&st.db)
    .await
    .map_err(internal)?;

    let out = rows
        .into_iter()
        .map(|r| KeyOut {
            masked: mask_key(&r.key),
            active: r.revoked_at.is_none(),
            id: r.id,
            label: r.label,
            created_at: r.created_at,
            revoked_at: r.revoked_at,
        })
        .collect();
    Ok(Json(out))
}

async fn create_key(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<CreateKeyReq>,
) -> Result<(StatusCode, Json<CreatedKey>), (StatusCode, String)> {
    auth_admin(&headers)?;

    // Single-user model: new keys belong to the existing (oldest) user.
    let user_id: uuid::Uuid =
        sqlx::query_scalar("select id from users order by created_at asc limit 1")
            .fetch_optional(&st.db)
            .await
            .map_err(internal)?
            .ok_or((StatusCode::CONFLICT, "no user exists yet".to_string()))?;

    let key = format!("tm_{}", uuid::Uuid::new_v4().simple());
    sqlx::query("insert into api_keys (key, user_id, label) values ($1, $2, $3)")
        .bind(&key)
        .bind(user_id)
        .bind(&req.label)
        .execute(&st.db)
        .await
        .map_err(internal)?;

    let id: uuid::Uuid = sqlx::query_scalar("select id from api_keys where key = $1")
        .bind(&key)
        .fetch_one(&st.db)
        .await
        .map_err(internal)?;

    Ok((StatusCode::CREATED, Json(CreatedKey { id, key, label: req.label })))
}

async fn revoke_key(
    State(st): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<uuid::Uuid>,
) -> Result<StatusCode, (StatusCode, String)> {
    auth_admin(&headers)?;
    let res = sqlx::query("update api_keys set revoked_at = now() where id = $1 and revoked_at is null")
        .bind(id)
        .execute(&st.db)
        .await
        .map_err(internal)?;
    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "no active key with that id".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Admin gate for key management. Requires `Authorization: Bearer <TOKENMOTH_ADMIN_TOKEN>`.
/// Returns 503 if the server has no admin token configured.
fn auth_admin(headers: &HeaderMap) -> Result<(), (StatusCode, String)> {
    let configured = std::env::var("TOKENMOTH_ADMIN_TOKEN").ok().filter(|s| !s.is_empty());
    let Some(expected) = configured else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            "key management disabled (TOKENMOTH_ADMIN_TOKEN not set)".to_string(),
        ));
    };
    match bearer(headers) {
        Some(t) if t == expected => Ok(()),
        _ => Err((StatusCode::UNAUTHORIZED, "admin auth required".to_string())),
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn rate_limiter_caps_burst_then_refills() {
        let rl = RateLimiter::per_minute(60.0); // capacity 60, 1 token/sec
        let t0 = Instant::now();
        // Drain the full bucket of 60.
        for _ in 0..60 {
            assert!(rl.check("k", t0));
        }
        // 61st in the same instant is rejected.
        assert!(!rl.check("k", t0));
        // After 1s, exactly one token has refilled.
        let t1 = t0 + Duration::from_secs(1);
        assert!(rl.check("k", t1));
        assert!(!rl.check("k", t1));
    }

    #[test]
    fn rate_limiter_is_per_key() {
        let rl = RateLimiter::per_minute(1.0); // capacity 1
        let t0 = Instant::now();
        assert!(rl.check("a", t0));
        assert!(!rl.check("a", t0)); // a exhausted
        assert!(rl.check("b", t0)); // b independent
    }

    #[test]
    fn cost_rounds_to_cents() {
        // 1M input @ $5 = $5.00 exactly.
        assert_eq!(cost_usd(1_000_000, 0, 0, 0), 5.0);
        assert_eq!(cost_usd(0, 0, 0, 0), 0.0);
    }

    #[test]
    fn repo_from_path_basename() {
        assert_eq!(repo_from_path("/a/b/sample/"), "sample");
        assert_eq!(repo_from_path(""), "unknown");
    }

    #[test]
    fn mask_key_hides_the_middle() {
        assert_eq!(mask_key("tm_0123456789abcdef"), "tm_0123…cdef");
        assert_eq!(mask_key("tm_short"), "tm_…");
    }
}
