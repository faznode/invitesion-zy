//! Telemetry (G-020): one JSON log line per request with its request id, matched route, method, status and latency,
//! which is enough to derive RED figures per endpoint from the log drain. `x-request-id` is accepted from Next.js or
//! minted here, and returned on every response. Trace export (OpenTelemetry) waits for a collector endpoint, an
//! operational dependency tracked in the implementation log.

use std::time::Duration;

use axum::Router;
use axum::extract::MatchedPath;
use axum::http::{Request, Response};
use tower_http::request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer};
use tower_http::trace::TraceLayer;
use tracing::Span;
use tracing_subscriber::EnvFilter;

/// JSON logs to stdout. `RUST_LOG` overrides the default filter.
pub fn init() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn"));
    let _ =
        tracing_subscriber::fmt().json().flatten_event(true).with_current_span(true).with_env_filter(filter).try_init();
}

/// Request ids and per-request logging around every route.
pub fn layer(router: Router) -> Router {
    let trace = TraceLayer::new_for_http()
        .make_span_with(|request: &Request<_>| {
            let route = request.extensions().get::<MatchedPath>().map(|p| p.as_str().to_string()).unwrap_or_default();
            let request_id = request
                .extensions()
                .get::<RequestId>()
                .and_then(|id| id.header_value().to_str().ok())
                .unwrap_or_default()
                .to_string();
            tracing::info_span!("request", method = %request.method(), route, request_id)
        })
        .on_request(())
        .on_response(|response: &Response<_>, latency: Duration, _span: &Span| {
            tracing::info!(
                status = response.status().as_u16(),
                latency_ms = latency.as_secs_f64() * 1000.0,
                "response"
            );
        });
    router
        .layer(PropagateRequestIdLayer::x_request_id())
        .layer(trace)
        .layer(SetRequestIdLayer::x_request_id(MakeRequestUuid))
}
