//! What a guest's personal link names (R-03, R-04): one guest of one published invitation, by the B-011 rule (the token
//! first, then the slug of a guest without a token), under the guest page's visibility rule (`openInvitationFor`): drafts
//! are not public and an expired invitation is read-only. Each guest write path answers with its own problem codes.

use time::PrimitiveDateTime;

use crate::app::AppState;
use crate::problem::ApiError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LinkCodes {
    /// 404: no published invitation, or no guest for this link.
    pub not_found: &'static str,
    /// 409 with detail `expired` (and the path's own closed reasons).
    pub closed: &'static str,
}

pub fn check_open(
    status: &str,
    expires_at: Option<PrimitiveDateTime>,
    now: PrimitiveDateTime,
    codes: LinkCodes,
) -> Result<(), ApiError> {
    if status == "DRAFT" {
        return Err(ApiError::NotFound(codes.not_found));
    }
    if status == "EXPIRED" || expires_at.is_some_and(|at| at < now) {
        return Err(ApiError::Conflict(codes.closed, Some("expired".into())));
    }
    Ok(())
}

/// The invitation and guest ids a personal link names.
pub async fn resolve(
    state: &AppState,
    slug: &str,
    segment: &str,
    now: PrimitiveDateTime,
    codes: LinkCodes,
) -> Result<(i32, i32), ApiError> {
    // B-031 (D-063): a deleted invitation's links are unknown links, in its window and after the purge.
    let invitation =
        sqlx::query!("select id, status, expires_at from invitations where slug = $1 and deleted_at is null", slug)
            .fetch_optional(&state.pool)
            .await
            .map_err(|error| ApiError::internal("guest_link_invitation", error))?
            .ok_or(ApiError::NotFound(codes.not_found))?;
    check_open(&invitation.status, invitation.expires_at, now, codes)?;
    if segment.is_empty() {
        return Err(ApiError::NotFound(codes.not_found));
    }
    let rows = sqlx::query!(
        "select id, link_token, slug from guests where invitation_id = $1 \
         and (link_token = $2 or (link_token is null and slug = $2)) limit 2",
        invitation.id,
        segment
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|error| ApiError::internal("guest_link_guest", error))?;
    let guest = rows
        .iter()
        .find(|row| row.link_token.as_deref() == Some(segment))
        .or_else(|| rows.iter().find(|row| row.link_token.is_none() && row.slug == segment))
        .ok_or(ApiError::NotFound(codes.not_found))?;
    Ok((invitation.id, guest.id))
}
