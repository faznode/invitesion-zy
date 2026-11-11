use invitesion_api::config::{Config, install_crypto_provider};
use invitesion_api::{AppState, router, telemetry};

#[tokio::main]
async fn main() {
    telemetry::init();
    install_crypto_provider();
    let config = Config::from_env().unwrap_or_else(|error| {
        tracing::error!(%error, "configuration refused");
        std::process::exit(2);
    });
    let state = AppState::from_config(&config).unwrap_or_else(|error| {
        tracing::error!(%error, "startup refused");
        std::process::exit(2);
    });
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", config.port)).await.unwrap_or_else(|error| {
        tracing::error!(%error, port = config.port, "bind failed");
        std::process::exit(2);
    });
    tracing::info!(port = config.port, "listening");
    axum::serve(listener, router(state)).with_graceful_shutdown(shutdown()).await.unwrap_or_else(|error| {
        tracing::error!(%error, "server stopped");
        std::process::exit(1);
    });
}

async fn shutdown() {
    let interrupt = tokio::signal::ctrl_c();
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            signal.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = interrupt => {}
        _ = terminate => {}
    }
}
