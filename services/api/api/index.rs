//! Vercel Rust runtime entry (beta, Fluid compute; `vercel.json` rewrites every path here). The router is the same as
//! the standalone server's. Not deployed from the sandbox: the first preview deployment is an owner step (R-01).

use invitesion_api::config::{Config, install_crypto_provider};
use invitesion_api::{AppState, router, telemetry};
use tower::ServiceBuilder;
use vercel_runtime::Error;
use vercel_runtime::axum::VercelLayer;

#[tokio::main]
async fn main() -> Result<(), Error> {
    telemetry::init();
    install_crypto_provider();
    let config = Config::from_env()?;
    let state = AppState::from_config(&config)?;
    let app = ServiceBuilder::new().layer(VercelLayer::new()).service(router(state));
    vercel_runtime::run(app).await
}
