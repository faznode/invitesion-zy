//! The wish rules of `lib/invitation/wish-decision.ts`, pinned by `contracts/vectors/wish-decisions.json`: the switch
//! first, then the message (JavaScript trim, at most 1,000 UTF-16 units, no U+0000, which Postgres `text` cannot hold);
//! a moderated guestbook stores the wish hidden and unreviewed (PENDING); a reply is trimmed and an empty one clears it.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::content::GuestbookRules;
use crate::rsvp::js::{js_trim, utf16_len};

pub const WISH_MAX_LENGTH: usize = 1000;
pub const REPLY_MAX_LENGTH: usize = 1000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GuestWishDecision {
    /// The host switched the guestbook off (`disabled`).
    Closed,
    Invalid,
    Write {
        message: String,
        is_hidden: bool,
    },
}

fn storable(text: &str) -> bool {
    !text.contains('\0')
}

pub fn decide_guest_wish(rules: GuestbookRules, message: &str) -> GuestWishDecision {
    if !rules.enabled {
        return GuestWishDecision::Closed;
    }
    let message = js_trim(message);
    if message.is_empty() || utf16_len(message) > WISH_MAX_LENGTH || !storable(message) {
        return GuestWishDecision::Invalid;
    }
    GuestWishDecision::Write { message: message.to_string(), is_hidden: rules.moderation }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostReplyDecision {
    Invalid,
    /// The reply to store; `None` clears it.
    Write(Option<String>),
}

pub fn decide_host_reply(reply: &str) -> HostReplyDecision {
    let text = js_trim(reply);
    if utf16_len(text) > REPLY_MAX_LENGTH || !storable(text) {
        return HostReplyDecision::Invalid;
    }
    HostReplyDecision::Write((!text.is_empty()).then(|| text.to_string()))
}

/// A wish as the guest page and the host see it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WishState {
    /// Listed on the guest page.
    Visible,
    /// Waiting for the host: the guestbook was moderated when it arrived.
    Pending,
    /// Hidden by the host.
    Hidden,
}

pub fn wish_state(is_hidden: bool, reviewed: bool) -> WishState {
    match (is_hidden, reviewed) {
        (false, _) => WishState::Visible,
        (true, false) => WishState::Pending,
        (true, true) => WishState::Hidden,
    }
}
