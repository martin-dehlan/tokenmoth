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
    // Supabase JWKS public keys (kid → key) for ES256 token verification.
    jwks: Arc<Vec<(String, jsonwebtoken::DecodingKey)>>,
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

fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "tokenmoth_api=info,tower_http=info".into()),
        )
        .init();
}

/// Build the fully-wired router. DB pool has the prepared-statement cache OFF so
/// it works behind Supabase's transaction pooler (pgBouncer) — required for the
/// Lambda/serverless deploy. Runs migrations + optional bootstrap.
async fn build_app() -> anyhow::Result<Router> {
    use sqlx::postgres::PgConnectOptions;
    use std::str::FromStr;

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL not set");
    let connect_opts = PgConnectOptions::from_str(&db_url)?.statement_cache_capacity(0);
    // Supabase session pooler caps total clients at 15. On Lambda, many warm/
    // concurrent containers each holding a pool exhausts that → EMAXCONNSESSION.
    // Keep each container small and release idle connections fast so slots recycle;
    // a Lambda reserved-concurrency cap (deploy-lambda.sh) hard-bounds containers.
    let max_conn: u32 = std::env::var("TOKENMOTH_DB_MAX_CONN")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(1);
    let db = PgPoolOptions::new()
        .max_connections(max_conn)
        .min_connections(0)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .idle_timeout(std::time::Duration::from_secs(8))
        .max_lifetime(std::time::Duration::from_secs(60))
        .connect_with(connect_opts)
        .await?;

    sqlx::migrate!("../../migrations").run(&db).await?;

    // Optional single-user bootstrap: self-seed a user + API key on startup.
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

    let jwks = load_jwks().await;
    tracing::info!("loaded {} JWKS key(s)", jwks.len());

    let state = AppState {
        db,
        rate: Arc::new(RateLimiter::per_minute(rpm)),
        jwks: Arc::new(jwks),
    };
    Ok(Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/v1/telemetry", post(ingest))
        .route("/v1/repos", get(list_repos))
        .route("/v1/repos/:name/series", get(repo_series))
        .route("/v1/series", get(account_series))
        .route("/v1/dashboard", get(dashboard))
        .route("/v1/models", get(list_models))
        .route("/v1/trends", get(trends))
        .route("/v1/export", get(export))
        .route("/v1/keys", get(list_keys).post(create_key))
        .route("/v1/keys/:id/revoke", post(revoke_key))
        .route("/v1/me", get(me))
        .layer(DefaultBodyLimit::max(MAX_BODY_BYTES))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state))
}

/// Local / container entrypoint — long-running HTTP server.
#[cfg(not(feature = "lambda"))]
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();
    let app = build_app().await?;
    let addr: std::net::SocketAddr = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".into())
        .parse()?;
    tracing::info!("tokenmoth-api listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

/// AWS Lambda entrypoint (scale-to-zero) — built with `--features lambda`.
#[cfg(feature = "lambda")]
#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    init_tracing();
    let app = build_app()
        .await
        .map_err(|e| lambda_http::Error::from(e.to_string()))?;
    lambda_http::run(app).await
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

    // Product analytics: ingestion milestone (#26). Fire-and-forget, env-gated.
    posthog_capture(
        user_id.to_string(),
        "session_tracked",
        serde_json::json!({
            "repo": repo,
            "model": t.model,
            "input_tokens": t.input_tokens,
            "output_tokens": t.output_tokens,
            "cache_read_input_tokens": t.cache_read_input_tokens,
            "cache_creation_input_tokens": t.cache_creation_input_tokens,
        }),
    );

    Ok(StatusCode::ACCEPTED)
}

/// Fire-and-forget PostHog event capture (#26). No-op unless POSTHOG_KEY is set;
/// never blocks or fails the request.
fn posthog_capture(distinct_id: String, event: &'static str, properties: serde_json::Value) {
    let key = match std::env::var("POSTHOG_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => return,
    };
    let host = std::env::var("POSTHOG_HOST")
        .unwrap_or_else(|_| "https://eu.i.posthog.com".to_string());
    tokio::spawn(async move {
        let body = serde_json::json!({
            "api_key": key,
            "event": event,
            "distinct_id": distinct_id,
            "properties": properties,
        });
        let _ = reqwest::Client::new()
            .post(format!("{}/capture/", host.trim_end_matches('/')))
            .json(&body)
            .send()
            .await;
    });
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

/// Per-model API pay-as-you-go rates, USD per 1M tokens (#72/#73). Matched by
/// family prefix; null/unknown falls back to Opus. Cache read = 10% of input,
/// cache write = 125% of input.
struct ModelPrice {
    input: f64,
    output: f64,
    cache_read: f64,
    cache_write: f64,
}

fn price_for(model: Option<&str>) -> ModelPrice {
    let m = model.unwrap_or("").to_ascii_lowercase();
    let (input, output) = if m.contains("haiku") {
        (1.0, 5.0)
    } else if m.contains("sonnet") {
        (3.0, 15.0)
    } else {
        (5.0, 25.0) // opus / unknown fallback
    };
    ModelPrice { input, output, cache_read: input * 0.10, cache_write: input * 1.25 }
}

/// API-equivalent cost for one model's token totals (not rounded — sum first).
fn cost_for(model: Option<&str>, input: i64, output: i64, cache_read: i64, cache_creation: i64) -> f64 {
    let p = price_for(model);
    (input as f64 * p.input
        + output as f64 * p.output
        + cache_read as f64 * p.cache_read
        + cache_creation as f64 * p.cache_write)
        / 1_000_000.0
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
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;

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

// Window length for period-over-period comparison; None for "all"/invalid.
fn parse_window_duration(label: &str) -> Option<Duration> {
    if label == "all" {
        return None;
    }
    let (num, unit) = label.split_at(label.len().saturating_sub(1));
    let n: i64 = num.parse().ok()?;
    if n <= 0 {
        return None;
    }
    match unit {
        "h" => Some(Duration::hours(n)),
        "d" => Some(Duration::days(n)),
        _ => None,
    }
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
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;

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
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;

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
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;
    let rows: Vec<KeyRow> = sqlx::query_as(
        "select id, key, label, created_at, revoked_at from api_keys
         where user_id = $1 order by created_at desc",
    )
    .bind(user_id)
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
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;

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
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;
    let res = sqlx::query(
        "update api_keys set revoked_at = now() where id = $1 and user_id = $2 and revoked_at is null",
    )
    .bind(id)
    .bind(user_id)
    .execute(&st.db)
    .await
    .map_err(internal)?;
    if res.rows_affected() == 0 {
        return Err((StatusCode::NOT_FOUND, "no active key with that id".to_string()));
    }
    Ok(StatusCode::NO_CONTENT)
}

// ---- GET /v1/models : per-model rollup (#27) -------------------------------

#[derive(sqlx::FromRow)]
struct ModelRow {
    model: String,
    sessions: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
}

#[derive(Serialize)]
struct ModelOut {
    model: String,
    sessions: i64,
    total_tokens: i64,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_tokens: i64,
    cache_creation_tokens: i64,
}

async fn list_models(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReposQuery>,
) -> Result<Json<Vec<ModelOut>>, (StatusCode, String)> {
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;
    let since = q.since.unwrap_or_else(|| "30d".to_string());
    let cutoff = parse_since(&since)
        .ok_or((StatusCode::BAD_REQUEST, "invalid `since`".to_string()))?;

    let rows: Vec<ModelRow> = sqlx::query_as(
        r#"
        select coalesce(nullif(model, ''), 'unknown')            as model,
               count(*)::bigint                                  as sessions,
               coalesce(sum(input_tokens), 0)::bigint            as input_tokens,
               coalesce(sum(output_tokens), 0)::bigint           as output_tokens,
               coalesce(sum(cache_read_input_tokens), 0)::bigint as cache_read_tokens,
               coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_tokens
        from token_logs
        where user_id = $1 and ($2::timestamptz is null or ended_at >= $2)
        group by 1
        order by (coalesce(sum(input_tokens),0) + coalesce(sum(output_tokens),0)
                + coalesce(sum(cache_read_input_tokens),0) + coalesce(sum(cache_creation_input_tokens),0)) desc
        "#,
    )
    .bind(user_id)
    .bind(cutoff)
    .fetch_all(&st.db)
    .await
    .map_err(internal)?;

    let out = rows
        .into_iter()
        .map(|r| ModelOut {
            total_tokens: r.input_tokens + r.output_tokens + r.cache_creation_tokens,
            model: r.model,
            sessions: r.sessions,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens,
            cache_creation_tokens: r.cache_creation_tokens,
        })
        .collect();
    Ok(Json(out))
}

// ---- GET /v1/trends : period-over-period + projection (#28) -----------------

#[derive(sqlx::FromRow)]
struct TrendRow {
    current_tokens: i64,
    previous_tokens: i64,
    current_sessions: i64,
    previous_sessions: i64,
}

#[derive(Serialize)]
struct TrendsOut {
    since: String,
    current_tokens: i64,
    previous_tokens: i64,
    has_previous: bool,
    delta_pct: Option<f64>,
    current_sessions: i64,
    previous_sessions: i64,
    daily_avg_tokens: i64,
    projected_monthly_tokens: i64,
}

async fn trends(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReposQuery>,
) -> Result<Json<TrendsOut>, (StatusCode, String)> {
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;
    let since = q.since.unwrap_or_else(|| "30d".to_string());
    let dur = parse_window_duration(&since);
    let now = Utc::now();
    let epoch = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
    let cur_start = dur.map(|d| now - d).unwrap_or(epoch);
    let prev_start = dur.map(|d| now - d * 2).unwrap_or(epoch);
    let has_previous = dur.is_some();

    let row: TrendRow = sqlx::query_as(
        r#"
        with t as (
            select ended_at,
                   (input_tokens + output_tokens + cache_creation_input_tokens) as tok
            from token_logs where user_id = $1
        )
        select
          coalesce(sum(case when ended_at >= $2 then tok else 0 end), 0)::bigint                       as current_tokens,
          coalesce(sum(case when ended_at >= $3 and ended_at < $2 then tok else 0 end), 0)::bigint      as previous_tokens,
          count(*) filter (where ended_at >= $2)::bigint                                                as current_sessions,
          count(*) filter (where ended_at >= $3 and ended_at < $2)::bigint                              as previous_sessions
        from t
        "#,
    )
    .bind(user_id)
    .bind(cur_start)
    .bind(prev_start)
    .fetch_one(&st.db)
    .await
    .map_err(internal)?;

    let delta_pct = if has_previous && row.previous_tokens > 0 {
        Some(
            ((row.current_tokens - row.previous_tokens) as f64 / row.previous_tokens as f64 * 100.0
                * 10.0)
                .round()
                / 10.0,
        )
    } else {
        None
    };
    let days = dur.map(|d| d.num_days().max(1)).unwrap_or(30);
    let daily_avg = row.current_tokens / days;
    Ok(Json(TrendsOut {
        since,
        current_tokens: row.current_tokens,
        previous_tokens: row.previous_tokens,
        has_previous,
        delta_pct,
        current_sessions: row.current_sessions,
        previous_sessions: row.previous_sessions,
        daily_avg_tokens: daily_avg,
        projected_monthly_tokens: daily_avg * 30,
    }))
}

// ---- GET /v1/dashboard : repos + series + models + trends in ONE response --
// (#65) Collapses the dashboard's 4 parallel calls into one request → one Lambda
// invocation → one DB connection (queries run sequentially on st.db), so it stays
// well under the Supabase session-pooler 15-client cap.

#[derive(Serialize)]
struct DashboardResponse {
    since: String,
    repos: Vec<RepoOut>,
    series: Vec<SeriesPoint>,
    models: Vec<ModelOut>,
    trends: TrendsOut,
    /// API pay-as-you-go cost of this window's usage, priced per model (#72).
    api_cost_usd: f64,
}

async fn dashboard(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ReposQuery>,
) -> Result<Json<DashboardResponse>, (StatusCode, String)> {
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;
    let since = q.since.unwrap_or_else(|| "30d".to_string());
    let cutoff = parse_since(&since)
        .ok_or((StatusCode::BAD_REQUEST, "invalid `since` (use 24h|7d|30d|90d|all)".to_string()))?;

    // 1) per-repo rollups
    let repo_rows: Vec<RepoRow> = sqlx::query_as(
        r#"
        select repo,
               count(*)::bigint                                   as sessions,
               coalesce(sum(input_tokens), 0)::bigint             as input_tokens,
               coalesce(sum(output_tokens), 0)::bigint            as output_tokens,
               coalesce(sum(cache_read_input_tokens), 0)::bigint  as cache_read_tokens,
               coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_tokens,
               max(ended_at)                                      as last_active
        from token_logs
        where user_id = $1 and ($2::timestamptz is null or ended_at >= $2)
        group by repo order by last_active desc limit 500
        "#,
    )
    .bind(user_id).bind(cutoff).fetch_all(&st.db).await.map_err(internal)?;
    let repos = repo_rows
        .into_iter()
        .map(|r| RepoOut {
            total_tokens: r.input_tokens + r.output_tokens + r.cache_creation_tokens,
            estimated_cost_usd: cost_usd(r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens),
            repo: r.repo, sessions: r.sessions, input_tokens: r.input_tokens, output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens, cache_creation_tokens: r.cache_creation_tokens, last_active: r.last_active,
        })
        .collect();

    // 2) account-wide daily series
    let series_rows: Vec<SeriesRow> = sqlx::query_as(
        r#"
        select date_trunc('day', ended_at)::date                 as day,
               count(*)::bigint                                   as sessions,
               coalesce(sum(input_tokens), 0)::bigint             as input_tokens,
               coalesce(sum(output_tokens), 0)::bigint            as output_tokens,
               coalesce(sum(cache_read_input_tokens), 0)::bigint  as cache_read_tokens,
               coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_tokens
        from token_logs
        where user_id = $1 and ($2::timestamptz is null or ended_at >= $2)
        group by day order by day asc
        "#,
    )
    .bind(user_id).bind(cutoff).fetch_all(&st.db).await.map_err(internal)?;
    let series = series_rows
        .into_iter()
        .map(|r| SeriesPoint {
            total_tokens: r.input_tokens + r.output_tokens + r.cache_creation_tokens,
            estimated_cost_usd: cost_usd(r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens),
            day: r.day, sessions: r.sessions, input_tokens: r.input_tokens, output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens, cache_creation_tokens: r.cache_creation_tokens,
        })
        .collect();

    // 3) per-model rollups
    let model_rows: Vec<ModelRow> = sqlx::query_as(
        r#"
        select coalesce(nullif(model, ''), 'unknown')            as model,
               count(*)::bigint                                  as sessions,
               coalesce(sum(input_tokens), 0)::bigint            as input_tokens,
               coalesce(sum(output_tokens), 0)::bigint           as output_tokens,
               coalesce(sum(cache_read_input_tokens), 0)::bigint as cache_read_tokens,
               coalesce(sum(cache_creation_input_tokens), 0)::bigint as cache_creation_tokens
        from token_logs
        where user_id = $1 and ($2::timestamptz is null or ended_at >= $2)
        group by 1
        order by (coalesce(sum(input_tokens),0) + coalesce(sum(output_tokens),0)
                + coalesce(sum(cache_read_input_tokens),0) + coalesce(sum(cache_creation_input_tokens),0)) desc
        "#,
    )
    .bind(user_id).bind(cutoff).fetch_all(&st.db).await.map_err(internal)?;
    // API-equivalent cost, priced per model (#72/#73), summed then rounded to cents.
    let api_cost_raw: f64 = model_rows
        .iter()
        .map(|r| cost_for(Some(&r.model), r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens))
        .sum();
    let api_cost_usd = (api_cost_raw * 100.0).round() / 100.0;
    let models = model_rows
        .into_iter()
        .map(|r| ModelOut {
            total_tokens: r.input_tokens + r.output_tokens + r.cache_creation_tokens,
            model: r.model, sessions: r.sessions, input_tokens: r.input_tokens, output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens, cache_creation_tokens: r.cache_creation_tokens,
        })
        .collect();

    // 4) trends (period-over-period + projection)
    let dur = parse_window_duration(&since);
    let now = Utc::now();
    let epoch = DateTime::<Utc>::from_timestamp(0, 0).unwrap();
    let cur_start = dur.map(|d| now - d).unwrap_or(epoch);
    let prev_start = dur.map(|d| now - d * 2).unwrap_or(epoch);
    let has_previous = dur.is_some();
    let trow: TrendRow = sqlx::query_as(
        r#"
        with t as (
            select ended_at, (input_tokens + output_tokens + cache_creation_input_tokens) as tok
            from token_logs where user_id = $1
        )
        select
          coalesce(sum(case when ended_at >= $2 then tok else 0 end), 0)::bigint                  as current_tokens,
          coalesce(sum(case when ended_at >= $3 and ended_at < $2 then tok else 0 end), 0)::bigint as previous_tokens,
          count(*) filter (where ended_at >= $2)::bigint                                           as current_sessions,
          count(*) filter (where ended_at >= $3 and ended_at < $2)::bigint                         as previous_sessions
        from t
        "#,
    )
    .bind(user_id).bind(cur_start).bind(prev_start).fetch_one(&st.db).await.map_err(internal)?;
    let delta_pct = if has_previous && trow.previous_tokens > 0 {
        Some(((trow.current_tokens - trow.previous_tokens) as f64 / trow.previous_tokens as f64 * 1000.0).round() / 10.0)
    } else {
        None
    };
    let days = dur.map(|d| d.num_days().max(1)).unwrap_or(30);
    let daily_avg = trow.current_tokens / days;
    let trends = TrendsOut {
        since: since.clone(),
        current_tokens: trow.current_tokens,
        previous_tokens: trow.previous_tokens,
        has_previous,
        delta_pct,
        current_sessions: trow.current_sessions,
        previous_sessions: trow.previous_sessions,
        daily_avg_tokens: daily_avg,
        projected_monthly_tokens: daily_avg * 30,
    };

    Ok(Json(DashboardResponse { since, repos, series, models, trends, api_cost_usd }))
}

// ---- GET /v1/export : CSV/JSON of the user's sessions (#29) -----------------

#[derive(Deserialize)]
struct ExportQuery {
    since: Option<String>,
    format: Option<String>,
}

#[derive(sqlx::FromRow, Serialize)]
struct ExportRow {
    session_id: String,
    repo: String,
    model: String,
    input_tokens: i64,
    output_tokens: i64,
    cache_read_input_tokens: i64,
    cache_creation_input_tokens: i64,
    ended_at: DateTime<Utc>,
}

async fn export(
    State(st): State<AppState>,
    headers: HeaderMap,
    Query(q): Query<ExportQuery>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    use axum::response::IntoResponse;
    let (user_id, _) = auth_supabase_user(&st, &headers).await?;
    let since = q.since.unwrap_or_else(|| "30d".to_string());
    let cutoff = parse_since(&since)
        .ok_or((StatusCode::BAD_REQUEST, "invalid `since`".to_string()))?;

    let rows: Vec<ExportRow> = sqlx::query_as(
        r#"
        select session_id, repo, coalesce(model, '') as model,
               input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, ended_at
        from token_logs
        where user_id = $1 and ($2::timestamptz is null or ended_at >= $2)
        order by ended_at desc
        "#,
    )
    .bind(user_id)
    .bind(cutoff)
    .fetch_all(&st.db)
    .await
    .map_err(internal)?;

    if q.format.as_deref() == Some("json") {
        return Ok(Json(rows).into_response());
    }

    let mut csv = String::from(
        "session_id,repo,model,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,ended_at\n",
    );
    for r in &rows {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            r.session_id,
            r.repo,
            r.model,
            r.input_tokens,
            r.output_tokens,
            r.cache_read_input_tokens,
            r.cache_creation_input_tokens,
            r.ended_at.to_rfc3339()
        ));
    }
    Ok(axum::response::Response::builder()
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", "attachment; filename=\"tokenmoth-export.csv\"")
        .body(axum::body::Body::from(csv))
        .unwrap())
}

// ---- Supabase OAuth auth (#21): validate a Supabase JWT → local user --------

#[derive(serde::Deserialize)]
struct SupabaseClaims {
    sub: String, // supabase auth user id (uuid)
    #[serde(default)]
    email: Option<String>,
    #[allow(dead_code)] // validated by jsonwebtoken, not read directly
    exp: usize,
}

#[derive(Serialize)]
struct Me {
    user_id: uuid::Uuid,
    email: Option<String>,
}

/// `GET /v1/me` — verifies the caller's Supabase JWT and returns the linked
/// local user (creating it on first login). The frontend uses this to confirm a
/// session works end-to-end against the API.
async fn me(
    State(st): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Me>, (StatusCode, String)> {
    let (user_id, email) = auth_supabase_user(&st, &headers).await?;
    Ok(Json(Me { user_id, email }))
}

/// Validate a Supabase JWT (ES256 via JWKS, or legacy HS256 via the secret) and
/// resolve it to a local `users.id`, creating/linking the user on first sight.
async fn auth_supabase_user(
    st: &AppState,
    headers: &HeaderMap,
) -> Result<(uuid::Uuid, Option<String>), (StatusCode, String)> {
    let token = bearer(headers).ok_or((StatusCode::UNAUTHORIZED, "missing token".to_string()))?;
    let secret = std::env::var("SUPABASE_JWT_SECRET").ok().filter(|s| !s.is_empty());

    let claims = decode_supabase_jwt(&token, &st.jwks, secret.as_deref())
        .map_err(|e| (StatusCode::UNAUTHORIZED, format!("invalid token: {e}")))?;

    let supa_uid = uuid::Uuid::parse_str(&claims.sub)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "bad subject".to_string()))?;
    let user_id = get_or_create_user(&st.db, supa_uid, claims.email.as_deref())
        .await
        .map_err(internal)?;
    Ok((user_id, claims.email))
}

/// Verify a Supabase JWT. ES256 → JWKS key matching the header `kid`;
/// HS256 → the shared secret. Audience must be `authenticated`.
fn decode_supabase_jwt(
    token: &str,
    jwks: &[(String, jsonwebtoken::DecodingKey)],
    secret: Option<&str>,
) -> Result<SupabaseClaims, jsonwebtoken::errors::Error> {
    use jsonwebtoken::errors::ErrorKind;
    use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};

    let header = decode_header(token)?;
    let claims = match header.alg {
        Algorithm::ES256 => {
            let kid = header.kid.ok_or(ErrorKind::InvalidKeyFormat)?;
            let key = jwks
                .iter()
                .find(|(k, _)| *k == kid)
                .map(|(_, d)| d)
                .ok_or(ErrorKind::InvalidKeyFormat)?;
            let mut v = Validation::new(Algorithm::ES256);
            v.set_audience(&["authenticated"]);
            decode::<SupabaseClaims>(token, key, &v)?.claims
        }
        Algorithm::HS256 => {
            let secret = secret.ok_or(ErrorKind::InvalidKeyFormat)?;
            let key = DecodingKey::from_secret(secret.as_bytes());
            let mut v = Validation::new(Algorithm::HS256);
            v.set_audience(&["authenticated"]);
            decode::<SupabaseClaims>(token, &key, &v)?.claims
        }
        _ => return Err(ErrorKind::InvalidAlgorithm.into()),
    };
    Ok(claims)
}

/// Fetch the Supabase JWKS (ES256 public keys) once at startup. Empty on failure
/// (HS256 still works via the secret). Requires `SUPABASE_URL`.
async fn load_jwks() -> Vec<(String, jsonwebtoken::DecodingKey)> {
    let Ok(url) = std::env::var("SUPABASE_URL") else {
        return Vec::new();
    };
    let endpoint = format!("{}/auth/v1/.well-known/jwks.json", url.trim_end_matches('/'));
    let set: jsonwebtoken::jwk::JwkSet = match reqwest::get(&endpoint).await {
        Ok(r) => match r.json().await {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!("JWKS parse failed: {e}");
                return Vec::new();
            }
        },
        Err(e) => {
            tracing::warn!("JWKS fetch failed: {e}");
            return Vec::new();
        }
    };
    set.keys
        .iter()
        .filter_map(|jwk| {
            let kid = jwk.common.key_id.clone()?;
            jsonwebtoken::DecodingKey::from_jwk(jwk).ok().map(|d| (kid, d))
        })
        .collect()
}

/// Find the local user for a Supabase auth id, or create/link one.
async fn get_or_create_user(
    db: &PgPool,
    supa_uid: uuid::Uuid,
    email: Option<&str>,
) -> anyhow::Result<uuid::Uuid> {
    if let Some(id) =
        sqlx::query_scalar::<_, uuid::Uuid>("select id from users where supabase_user_id = $1")
            .bind(supa_uid)
            .fetch_optional(db)
            .await?
    {
        return Ok(id);
    }
    let email = email
        .filter(|e| !e.is_empty())
        .map(|e| e.to_string())
        .unwrap_or_else(|| format!("{supa_uid}@users.tokenmoth"));
    // Link by email if that user already exists, else create.
    let id: uuid::Uuid = sqlx::query_scalar(
        "insert into users (email, supabase_user_id) values ($1, $2)
         on conflict (email) do update set supabase_user_id = excluded.supabase_user_id
         returning id",
    )
    .bind(&email)
    .bind(supa_uid)
    .fetch_one(db)
    .await?;
    Ok(id)
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
    fn api_cost_prices_per_model_family() {
        // 1M input + 1M output, by family.
        assert_eq!(cost_for(Some("claude-opus-4-8"), 1_000_000, 1_000_000, 0, 0), 30.0); // 5 + 25
        assert_eq!(cost_for(Some("claude-sonnet-4-6"), 1_000_000, 1_000_000, 0, 0), 18.0); // 3 + 15
        assert_eq!(cost_for(Some("claude-haiku-4-5"), 1_000_000, 1_000_000, 0, 0), 6.0); // 1 + 5
        // null/unknown → Opus fallback.
        assert_eq!(cost_for(None, 1_000_000, 0, 0, 0), 5.0);
        assert_eq!(cost_for(Some("mystery"), 1_000_000, 0, 0, 0), 5.0);
        // cache read = 10% input, cache write = 125% input (Opus).
        assert!((cost_for(Some("opus"), 0, 0, 1_000_000, 1_000_000) - (0.5 + 6.25)).abs() < 1e-9);
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

    #[test]
    fn supabase_jwt_validates_and_rejects_wrong_secret() {
        use jsonwebtoken::{encode, EncodingKey, Header};
        let secret = "test-jwt-secret";
        let claims = serde_json::json!({
            "sub": "11111111-2222-3333-4444-555555555555",
            "email": "dev@example.com",
            "aud": "authenticated",
            "exp": 9_999_999_999u64,
        });
        let token = encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap();

        let ok = decode_supabase_jwt(&token, &[], Some(secret)).unwrap();
        assert_eq!(ok.email.as_deref(), Some("dev@example.com"));
        assert_eq!(ok.sub, "11111111-2222-3333-4444-555555555555");
        assert!(decode_supabase_jwt(&token, &[], Some("wrong-secret")).is_err());
    }
}
