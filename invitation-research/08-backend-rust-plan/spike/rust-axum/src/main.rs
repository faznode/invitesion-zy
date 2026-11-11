//! Throwaway spike for brief 03 §18: the public guest-page read and the RSVP write of Invitesion,
//! re-implemented on Axum + tokio-postgres against the same Postgres schema and fake data.
//!
//! It mirrors the current code paths so the comparison measures the stack, not different work:
//! - GET  /i/:slug/:guest       = lib/invitation/public.ts loadPublicInvitation (invitation, guest, media,
//!                                latest 50 visible wishes, count) + trackInvitationView (30-minute dedupe,
//!                                VIEW insert, opened_count update) spawned after the response, like `after()`.
//! - POST /i/:slug/:guest/rsvp  = app/i/[slug]/actions.ts submitRsvp (open check, status whitelist, the same
//!                                guest_count rule, UPDATE guests, INSERT analytics_events RSVP, 303 redirect).
//! Differences that remain (documented in ../README.md): a small hand-written HTML page instead of the React
//! renderer, and serde_json::Value instead of the zod config parse.

use std::{env, net::SocketAddr, sync::Arc};

use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{Html, IntoResponse, Redirect, Response},
    routing::{get, post},
    Form, Router,
};
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod};
use serde::Deserialize;
use serde_json::Value;
use tokio_postgres::{types::ToSql, NoTls};

const GUESTBOOK_PAGE_SIZE: i64 = 50;

struct AppState {
    pool: Pool,
}

#[derive(Deserialize)]
struct RsvpForm {
    status: Option<String>,
    #[serde(rename = "guestCount")]
    guest_count: Option<String>,
}

fn escape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn guest_path(slug: &str, guest: &str) -> String {
    format!("/i/{slug}/{guest}")
}

fn server_error(error: impl std::fmt::Display) -> Response {
    eprintln!("spike error: {error}");
    (StatusCode::INTERNAL_SERVER_ERROR, "error").into_response()
}

struct OpenInvitation {
    invitation_id: i32,
    guest_id: i32,
    guest_count: i32,
}

/// Same rules as `openInvitationFor`: not DRAFT, not EXPIRED, not past expires_at, guest belongs to it.
async fn open_invitation(client: &deadpool_postgres::Client, slug: &str, guest_slug: &str) -> Result<Option<OpenInvitation>, tokio_postgres::Error> {
    let invitation = client
        .query_opt(
            "SELECT id, status, (expires_at IS NOT NULL AND expires_at < now()) AS past FROM invitations WHERE slug = $1 LIMIT 1",
            &[&slug],
        )
        .await?;
    let Some(invitation) = invitation else { return Ok(None) };
    let status: String = invitation.get("status");
    let past: bool = invitation.get("past");
    if status == "DRAFT" || status == "EXPIRED" || past {
        return Ok(None);
    }
    let invitation_id: i32 = invitation.get("id");
    let guest = client
        .query_opt(
            "SELECT id, guest_count FROM guests WHERE invitation_id = $1 AND slug = $2 LIMIT 1",
            &[&invitation_id, &guest_slug],
        )
        .await?;
    Ok(guest.map(|row| OpenInvitation {
        invitation_id,
        guest_id: row.get("id"),
        guest_count: row.get::<_, Option<i32>>("guest_count").unwrap_or(1),
    }))
}

async fn guest_page(State(state): State<Arc<AppState>>, Path((slug, guest_slug)): Path<(String, String)>) -> Response {
    let client = match state.pool.get().await {
        Ok(client) => client,
        Err(error) => return server_error(error),
    };
    let invitation = match client
        .query_opt(
            "SELECT id, status, config, (status = 'EXPIRED' OR (expires_at IS NOT NULL AND expires_at < now())) AS expired \
             FROM invitations WHERE slug = $1 LIMIT 1",
            &[&slug],
        )
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return (StatusCode::NOT_FOUND, "Undangan tidak ditemukan").into_response(),
        Err(error) => return server_error(error),
    };
    let status: String = invitation.get("status");
    if status == "DRAFT" {
        return (StatusCode::NOT_FOUND, "Undangan tidak ditemukan").into_response();
    }
    let invitation_id: i32 = invitation.get("id");
    let expired: bool = invitation.get("expired");
    let config: Value = invitation.get::<_, Option<Value>>("config").unwrap_or(Value::Null);

    let guest = match client
        .query_opt(
            "SELECT id, name, slug, guest_count FROM guests WHERE invitation_id = $1 AND slug = $2 LIMIT 1",
            &[&invitation_id, &guest_slug],
        )
        .await
    {
        Ok(Some(row)) => row,
        Ok(None) => return (StatusCode::NOT_FOUND, "Tamu tidak ditemukan").into_response(),
        Err(error) => return server_error(error),
    };
    let guest_id: i32 = guest.get("id");
    let guest_name: String = guest.get("name");
    let allowance: i32 = guest.get::<_, Option<i32>>("guest_count").unwrap_or(1).max(1);

    let guestbook_enabled = config.pointer("/guestbook/enabled").and_then(Value::as_bool) != Some(false);
    let id_params: [&(dyn ToSql + Sync); 1] = [&invitation_id];
    let message_params: [&(dyn ToSql + Sync); 2] = [&invitation_id, &GUESTBOOK_PAGE_SIZE];
    let (media, messages, total) = {
        let media_query = client.query(
            "SELECT id, type, url FROM media_assets WHERE invitation_id = $1 ORDER BY sort_order ASC, id ASC",
            &id_params,
        );
        if guestbook_enabled {
            let messages_query = client.query(
                "SELECT name, message FROM guest_messages WHERE invitation_id = $1 AND is_hidden = false ORDER BY created_at DESC LIMIT $2",
                &message_params,
            );
            let count_query = client.query_one(
                "SELECT count(*) AS value FROM guest_messages WHERE invitation_id = $1 AND is_hidden = false",
                &id_params,
            );
            match tokio::try_join!(media_query, messages_query, count_query) {
                Ok((media, messages, total)) => (media, messages, total.get::<_, i64>("value")),
                Err(error) => return server_error(error),
            }
        } else {
            match media_query.await {
                Ok(media) => (media, Vec::new(), 0),
                Err(error) => return server_error(error),
            }
        }
    };
    drop(client);

    let title = config
        .pointer("/settings/title")
        .and_then(Value::as_str)
        .unwrap_or("Undangan");
    let mut html = String::with_capacity(16 * 1024);
    html.push_str("<!doctype html><html lang=\"id\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
    html.push_str("<meta name=\"robots\" content=\"noindex, nofollow\"><title>");
    html.push_str(&escape(title));
    html.push_str("</title></head><body><main><section><p>Kepada Yth.</p><h1>");
    html.push_str(&escape(&guest_name));
    html.push_str("</h1></section><section><h2>Galeri</h2>");
    for asset in media.iter().filter(|row| row.get::<_, String>("type") == "photo") {
        html.push_str("<img loading=\"lazy\" alt=\"\" src=\"");
        html.push_str(&escape(&asset.get::<_, String>("url")));
        html.push_str("\">");
    }
    html.push_str("</section>");
    if !expired {
        html.push_str(&format!(
            "<section><h2>Konfirmasi Kehadiran</h2><form method=\"post\" action=\"{}/rsvp\"><input name=\"guestCount\" type=\"number\" min=\"1\" max=\"{allowance}\" value=\"{allowance}\"><button name=\"status\" value=\"CONFIRMED\">Hadir</button><button name=\"status\" value=\"DECLINED\">Tidak hadir</button></form></section>",
            escape(&guest_path(&slug, &guest_slug))
        ));
    }
    html.push_str(&format!("<section><h2>Ucapan &amp; Doa ({total})</h2><ol>"));
    for row in messages.iter().rev() {
        html.push_str("<li><b>");
        html.push_str(&escape(&row.get::<_, String>("name")));
        html.push_str("</b> ");
        html.push_str(&escape(&row.get::<_, String>("message")));
        html.push_str("</li>");
    }
    html.push_str("</ol></section></main></body></html>");

    let pool = state.pool.clone();
    tokio::spawn(async move {
        if let Ok(client) = pool.get().await {
            let recent = client
                .query_opt(
                    "SELECT id FROM analytics_events WHERE invitation_id = $1 AND event_type = 'VIEW' AND guest_id = $2 \
                     AND created_at >= now() - interval '30 minutes' LIMIT 1",
                    &[&invitation_id, &guest_id],
                )
                .await;
            if let Ok(None) = recent {
                let _ = client
                    .execute(
                        "INSERT INTO analytics_events (invitation_id, guest_id, event_type) VALUES ($1, $2, 'VIEW')",
                        &[&invitation_id, &guest_id],
                    )
                    .await;
                let _ = client
                    .execute(
                        "UPDATE guests SET opened_at = now(), opened_count = opened_count + 1 WHERE id = $1",
                        &[&guest_id],
                    )
                    .await;
            }
        }
    });

    ([(header::CACHE_CONTROL, "private, no-store")], Html(html)).into_response()
}

async fn submit_rsvp(
    State(state): State<Arc<AppState>>,
    Path((slug, guest_slug)): Path<(String, String)>,
    Form(form): Form<RsvpForm>,
) -> Response {
    let back = guest_path(&slug, &guest_slug);
    let client = match state.pool.get().await {
        Ok(client) => client,
        Err(error) => return server_error(error),
    };
    let context = match open_invitation(&client, &slug, &guest_slug).await {
        Ok(Some(context)) => context,
        Ok(None) => return Redirect::to(&format!("{back}?rsvp=closed")).into_response(),
        Err(error) => return server_error(error),
    };
    let status = form.status.unwrap_or_default();
    if status != "CONFIRMED" && status != "DECLINED" {
        return Redirect::to(&format!("{back}?rsvp=invalid")).into_response();
    }
    let attending: i32 = form.guest_count.as_deref().unwrap_or("1").parse().unwrap_or(1);
    let max_per_rsvp = if context.guest_count > 0 { context.guest_count } else { 1 };
    let guest_count = if status == "CONFIRMED" { attending.max(1).min(max_per_rsvp) } else { 0 };

    if let Err(error) = client
        .execute(
            "UPDATE guests SET rsvp_status = $1, guest_count = $2 WHERE id = $3",
            &[&status, &guest_count, &context.guest_id],
        )
        .await
    {
        return server_error(error);
    }
    let meta = serde_json::json!({ "status": status, "guestCount": guest_count, "source": "public" });
    if let Err(error) = client
        .execute(
            "INSERT INTO analytics_events (invitation_id, guest_id, event_type, meta) VALUES ($1, $2, 'RSVP', $3)",
            &[&context.invitation_id, &context.guest_id, &meta],
        )
        .await
    {
        return server_error(error);
    }
    Redirect::to(&format!("{back}?rsvp=saved")).into_response()
}

#[tokio::main]
async fn main() {
    let url = env::var("POSTGRES_URL").unwrap_or_else(|_| "postgres://postgres@127.0.0.1:5433/invitesion".into());
    let pool_size: usize = env::var("POOL_SIZE").ok().and_then(|v| v.parse().ok()).unwrap_or(10);
    let port: u16 = env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(3200);
    let config: tokio_postgres::Config = url.parse().expect("POSTGRES_URL");
    let manager = Manager::from_config(config, NoTls, ManagerConfig { recycling_method: RecyclingMethod::Fast });
    let pool = Pool::builder(manager).max_size(pool_size).build().expect("pool");
    let state = Arc::new(AppState { pool });
    let app = Router::new()
        .route("/i/:slug/:guest", get(guest_page))
        .route("/i/:slug/:guest/rsvp", post(submit_rsvp))
        .with_state(state);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("invitesion-spike listening on http://{addr} (pool {pool_size})");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}
