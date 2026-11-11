//! The OpenAPI 3.1 document, generated from the handler and type annotations (utoipa). `openapi.json` is the
//! committed copy; `lib/api/schema.d.ts` is generated from it, and CI fails when either drifts
//! (`scripts/api/contract.sh check`).

use utoipa::openapi::security::{ApiKey, ApiKeyValue, HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa::{Modify, OpenApi};

use crate::content::create::{DraftCreateRequest, DraftCreated};
use crate::content::http::{ContentSaved, ContentWriteRequest};
use crate::health::Health;
use crate::identity::Me;
use crate::payment::decision::{ActivationKind, EventStatus, Paid};
use crate::payment::http::{SettlementRequest, SettlementResult, SettlementSkip};
use crate::problem::{Problem, ProblemIssue};
use crate::roster::http::{
    CategoryInvitationRequest, CategoryInvitationSaved, CategoryMode, Decision, DecisionStatus, GuestAddRequest,
    GuestAdded, GuestFields, GuestImportRequest, GuestImportResult, GuestOperation, GuestOperationRequest,
    GuestUpdated, ImportRowVerdict, ImportUndone, InvitedEventsRequest, InvitedEventsSaved, LinkAction,
    PassCheckinRequest, PassCheckins, PassOutcome, PassScan, PassScanResult, RegistrationDecided,
    RegistrationDecisionRequest, RegistrationLinkRequest, RegistrationLinkSaved, RegistrationReceived,
    RegistrationRequest, RegistrationStatus, RosterFlags, VerdictStatus,
};
use crate::roster::rules::{DuplicateOf, ImportRefusal, RowReason};
use crate::rsvp::decision::{EventFields, RsvpFlags, RsvpSubmission};
use crate::rsvp::http::{GuestRsvpRequest, HostRsvpFlags, HostRsvpRequest, HostRsvpStatus, RsvpSaved};
use crate::service_auth::SIGNATURE_HEADER;
use crate::views::{RecordView, ViewRecorded};
use crate::wishes::decision::WishState;
use crate::wishes::http::{
    GuestWishRequest, ModeratedState, WishAction, WishModerated, WishModerationRequest, WishReplied, WishReplyRequest,
    WishSaved,
};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Invitesion API",
        version = "0.1.0",
        description = "Domain API (ADR-A2). Server-to-server only: every operation except liveness requires the internal service signature."
    ),
    paths(
        crate::health::health,
        crate::health::ready,
        crate::identity::me,
        crate::views::record_view,
        crate::rsvp::http::guest_rsvp,
        crate::rsvp::http::host_rsvp_override,
        crate::wishes::http::guest_wish,
        crate::wishes::http::moderate_wish,
        crate::wishes::http::reply_to_wish,
        crate::roster::http::add_guest,
        crate::roster::http::import_guests,
        crate::roster::http::undo_import,
        crate::roster::http::guest_operation,
        crate::roster::http::set_invited_events,
        crate::roster::http::set_category_invitation,
        crate::roster::http::registration_link,
        crate::roster::http::register,
        crate::roster::http::decide,
        crate::roster::http::pass_checkins,
        crate::content::http::write_content,
        crate::content::create::create_draft,
        crate::payment::http::settle
    ),
    components(schemas(
        Problem,
        ProblemIssue,
        Health,
        Me,
        RecordView,
        ViewRecorded,
        GuestRsvpRequest,
        RsvpSubmission,
        EventFields,
        RsvpFlags,
        RsvpSaved,
        HostRsvpRequest,
        HostRsvpFlags,
        HostRsvpStatus,
        GuestWishRequest,
        WishSaved,
        WishState,
        WishModerationRequest,
        WishAction,
        WishModerated,
        ModeratedState,
        WishReplyRequest,
        WishReplied,
        RosterFlags,
        GuestFields,
        GuestAddRequest,
        GuestAdded,
        GuestImportRequest,
        GuestImportResult,
        ImportRowVerdict,
        VerdictStatus,
        RowReason,
        DuplicateOf,
        ImportRefusal,
        ImportUndone,
        GuestOperationRequest,
        GuestOperation,
        GuestUpdated,
        InvitedEventsRequest,
        InvitedEventsSaved,
        CategoryInvitationRequest,
        CategoryMode,
        CategoryInvitationSaved,
        RegistrationLinkRequest,
        LinkAction,
        RegistrationLinkSaved,
        RegistrationRequest,
        RegistrationReceived,
        RegistrationStatus,
        RegistrationDecisionRequest,
        Decision,
        RegistrationDecided,
        DecisionStatus,
        ContentWriteRequest,
        ContentSaved,
        DraftCreateRequest,
        DraftCreated,
        PassCheckinRequest,
        PassScan,
        PassCheckins,
        PassScanResult,
        PassOutcome,
        SettlementRequest,
        SettlementResult,
        SettlementSkip,
        EventStatus,
        Paid,
        ActivationKind
    )),
    modifiers(&SecuritySchemes),
    tags(
        (name = "health", description = "Liveness and readiness"),
        (name = "identity", description = "Owner-token verification"),
        (name = "views", description = "Invitation opens (R-02)"),
        (name = "rsvp", description = "Guest RSVP and the host's override (R-03)"),
        (name = "wishes", description = "Guest wishes and the host's moderation and replies (R-04)"),
        (name = "roster", description = "The guest roster: adds, imports, operations, invite-only events and self-registration (B-033)"),
        (name = "content", description = "The editor's content writes with the version check (B-035) and draft creation with version 1 (B-037)"),
        (name = "payments", description = "Settlement of verified payment events with the entitlement outbox (B-039)")
    )
)]
pub struct ApiDoc;

struct SecuritySchemes;

impl Modify for SecuritySchemes {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "serviceSignature",
            SecurityScheme::ApiKey(ApiKey::Header(ApiKeyValue::with_description(
                SIGNATURE_HEADER,
                "t=<unix seconds>,v1=<hex HMAC-SHA256 of t.METHOD.path_and_query.sha256hex(body)>",
            ))),
        );
        components.add_security_scheme(
            "ownerToken",
            SecurityScheme::Http(HttpBuilder::new().scheme(HttpAuthScheme::Bearer).bearer_format("JWT").build()),
        );
    }
}

/// The document as committed: pretty JSON with a trailing newline.
pub fn document_json() -> String {
    let mut json = ApiDoc::openapi().to_pretty_json().expect("the OpenAPI document serialises");
    json.push('\n');
    json
}
