use std::sync::Arc;

use invitesion_api_feasibility::http::{AppState, router};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().json().with_env_filter(tracing_subscriber::EnvFilter::from_default_env()).init();
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL");
    let secret = std::env::var("INTERNAL_API_SECRET").expect("INTERNAL_API_SECRET");
    let port = std::env::var("PORT").unwrap_or_else(|_| "3200".into());

    let pool = PgPoolOptions::new().max_connections(10).connect(&database_url).await.expect("database");
    let state = AppState { pool, service_secret: Arc::new(secret.into_bytes()) };
    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{port}")).await.expect("bind");
    tracing::info!(port, "feasibility API listening");
    axum::serve(listener, router(state)).await.expect("serve");
}
