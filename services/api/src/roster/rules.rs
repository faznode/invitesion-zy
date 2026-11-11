//! B-033: the roster's rules, the Rust port of `lib/invitation/roster-rules.ts`. One decision for both writers
//! (`BACKEND_ROSTER=next|rust`): `contracts/vectors/roster-rules.json` runs here (`tests/roster_vectors.rs`) and in the
//! TypeScript suite, so a host's add, import or approved registration is judged and stored identically.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use super::phone::{WhatsAppNumber, parse_whatsapp_number};

/// Technical ceilings (`ROSTER_LIMITS`). No plan defines a guest count (an owner pricing decision); a plan limit can
/// only tighten these.
pub const MAX_GUESTS: usize = 3000;
pub const MAX_IMPORT_ROWS: usize = 1000;
pub const MAX_PENDING_REGISTRATIONS: usize = 300;
pub const MAX_SEATS: i32 = 50;
pub const MAX_REGISTRATION_SEATS: i32 = 5;
pub const MAX_NAME: usize = 150;
pub const MAX_CATEGORY: usize = 50;
pub const MAX_PHONE: usize = 30;
pub const MAX_BASE_SLUG: usize = 140;

/// JavaScript's `\s` (and so `String.prototype.trim`): Rust's `char::is_whitespace` differs at U+FEFF and U+0085.
pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{000B}' | '\u{000C}' | '\r' | ' ' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}' | '\u{2028}' | '\u{2029}' | '\u{202F}' | '\u{205F}' | '\u{3000}' | '\u{FEFF}'
    )
}

/// `collapseSpaces`: trimmed, every run of whitespace one space.
pub fn collapse_spaces(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut gap = false;
    for c in value.chars() {
        if is_js_space(c) {
            gap = true;
        } else {
            if gap && !out.is_empty() {
                out.push(' ');
            }
            gap = false;
            out.push(c);
        }
    }
    out
}

/// `String.prototype.trim`.
pub fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_space)
}

fn has_control(value: &str) -> bool {
    value.chars().any(|c| c <= '\u{001F}' || c == '\u{007F}')
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum RowReason {
    Name,
    Phone,
    Seats,
    Category,
}

impl RowReason {
    pub fn as_str(self) -> &'static str {
        match self {
            RowReason::Name => "name",
            RowReason::Phone => "phone",
            RowReason::Seats => "seats",
            RowReason::Category => "category",
        }
    }
}

/// One row's values as typed or as the cell held them.
#[derive(Debug, Clone, Copy, Default)]
pub struct RowInput<'a> {
    pub name: Option<&'a str>,
    pub phone: Option<&'a str>,
    pub category: Option<&'a str>,
    pub guest_count: Option<&'a str>,
}

/// A row that passed the rules, as it is stored; `digits` is B-018's number for the duplicate key.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RosterRow {
    pub name: String,
    pub phone: Option<String>,
    pub category: Option<String>,
    pub guest_count: i32,
    pub digits: Option<String>,
}

/// `checkRosterRow`: name, phone, seats, category, in that order.
pub fn check_row(input: &RowInput<'_>, max_seats: i32) -> Result<RosterRow, RowReason> {
    let name = collapse_spaces(input.name.unwrap_or_default());
    if name.is_empty() || name.chars().count() > MAX_NAME || has_control(&name) {
        return Err(RowReason::Name);
    }

    let phone = collapse_spaces(input.phone.unwrap_or_default());
    let digits = if phone.is_empty() {
        None
    } else {
        match parse_whatsapp_number(Some(&phone)) {
            WhatsAppNumber::Digits(digits) if phone.chars().count() <= MAX_PHONE => Some(digits),
            _ => return Err(RowReason::Phone),
        }
    };

    let seats = collapse_spaces(input.guest_count.unwrap_or_default());
    let guest_count = if seats.is_empty() {
        1
    } else if (1..=3).contains(&seats.len()) && seats.bytes().all(|b| b.is_ascii_digit()) {
        seats.parse::<i32>().map_err(|_| RowReason::Seats)?
    } else {
        return Err(RowReason::Seats);
    };
    if !(1..=max_seats).contains(&guest_count) {
        return Err(RowReason::Seats);
    }

    let category = collapse_spaces(input.category.unwrap_or_default());
    if category.chars().count() > MAX_CATEGORY || has_control(&category) {
        return Err(RowReason::Category);
    }

    Ok(RosterRow {
        name,
        phone: (!phone.is_empty()).then_some(phone),
        category: (!category.is_empty()).then_some(category),
        guest_count,
        digits,
    })
}

pub fn name_key(name: &str) -> String {
    format!("n:{}", collapse_spaces(name).to_lowercase())
}

pub fn phone_key(digits: &str) -> String {
    format!("p:{digits}")
}

/// `rosterKeys`: a guest on the list contributes its name, and its number when that parses.
pub fn roster_keys(name: &str, phone: Option<&str>) -> Vec<String> {
    match parse_whatsapp_number(phone) {
        WhatsAppNumber::Digits(digits) => vec![name_key(name), phone_key(&digits)],
        _ => vec![name_key(name)],
    }
}

/// `duplicateKey`: the number when there is one, otherwise the name.
pub fn duplicate_key(row: &RosterRow) -> String {
    match &row.digits {
        Some(digits) => phone_key(digits),
        None => name_key(&row.name),
    }
}

/// `acceptedKeys`: what an accepted row adds.
pub fn accepted_keys(row: &RosterRow) -> Vec<String> {
    match &row.digits {
        Some(digits) => vec![name_key(&row.name), phone_key(digits)],
        None => vec![name_key(&row.name)],
    }
}

/// `slugBase`: lower case, every run outside `a-z0-9` one dash, no dash at either end, at most 140 characters, `tamu`
/// when nothing is left.
pub fn slug_base(name: &str) -> String {
    let lower = name.to_lowercase();
    let mut slug = String::new();
    let mut gap = false;
    for c in js_trim(&lower).chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if gap && !slug.is_empty() {
                slug.push('-');
            }
            gap = false;
            slug.push(c);
        } else {
            gap = true;
        }
    }
    slug.truncate(MAX_BASE_SLUG);
    let cut = slug.trim_end_matches('-');
    if cut.is_empty() { "tamu".to_string() } else { cut.to_string() }
}

/// `claimSlug`: the base if free, otherwise `<base>-<n>` for the smallest free n ≥ 2; recorded as taken.
pub fn claim_slug(name: &str, taken: &mut HashSet<String>) -> String {
    let base = slug_base(name);
    let mut slug = base.clone();
    let mut n = 2;
    while taken.contains(&slug) {
        slug = format!("{base}-{n}");
        n += 1;
    }
    taken.insert(slug.clone());
    slug
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DuplicateOf {
    Roster,
    File,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImportVerdict {
    Ok { slug: String, row: RosterRow },
    Invalid(RowReason),
    Duplicate(DuplicateOf),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ImportRefusal {
    TooManyRows,
    RosterFull,
    NothingToImport,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportPlan {
    pub verdicts: Vec<ImportVerdict>,
    pub ok: usize,
    pub invalid: usize,
    pub duplicate: usize,
    pub refusal: Option<ImportRefusal>,
}

/// A guest already on the list, as the import compares it.
pub struct Existing<'a> {
    pub name: &'a str,
    pub phone: Option<&'a str>,
    pub slug: &'a str,
}

/// `planImport`: every verdict in file order, slugs for the accepted rows, and whether they fit.
pub fn plan_import(existing: &[Existing<'_>], rows: &[RowInput<'_>]) -> ImportPlan {
    if rows.len() > MAX_IMPORT_ROWS {
        return ImportPlan {
            verdicts: vec![],
            ok: 0,
            invalid: 0,
            duplicate: 0,
            refusal: Some(ImportRefusal::TooManyRows),
        };
    }
    let roster_taken: HashSet<String> =
        existing.iter().flat_map(|guest| roster_keys(guest.name, guest.phone)).collect();
    let mut file_taken = HashSet::new();
    let mut slugs: HashSet<String> = existing.iter().map(|guest| guest.slug.to_string()).collect();
    let verdicts: Vec<ImportVerdict> = rows
        .iter()
        .map(|input| match check_row(input, MAX_SEATS) {
            Err(reason) => ImportVerdict::Invalid(reason),
            Ok(row) => {
                let key = duplicate_key(&row);
                if roster_taken.contains(&key) {
                    ImportVerdict::Duplicate(DuplicateOf::Roster)
                } else if file_taken.contains(&key) {
                    ImportVerdict::Duplicate(DuplicateOf::File)
                } else {
                    file_taken.extend(accepted_keys(&row));
                    ImportVerdict::Ok { slug: claim_slug(&row.name, &mut slugs), row }
                }
            }
        })
        .collect();
    let ok = verdicts.iter().filter(|verdict| matches!(verdict, ImportVerdict::Ok { .. })).count();
    let invalid = verdicts.iter().filter(|verdict| matches!(verdict, ImportVerdict::Invalid(_))).count();
    let duplicate = verdicts.len() - ok - invalid;
    let refusal = if ok == 0 {
        Some(ImportRefusal::NothingToImport)
    } else if existing.len() + ok > MAX_GUESTS {
        Some(ImportRefusal::RosterFull)
    } else {
        None
    };
    ImportPlan { verdicts, ok, invalid, duplicate, refusal }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegistrationVerdict {
    Ok(RosterRow),
    Invalid(RowReason),
    /// Already a guest or already waiting: nothing is stored and the registrant sees the same thanks.
    Duplicate,
    Full,
}

/// A person known to the invitation: a guest or a waiting registration.
pub struct Known<'a> {
    pub name: &'a str,
    pub phone: Option<&'a str>,
}

/// `decideRegistration`: the row rules with the registration's seat ceiling and no category, then duplicates against
/// guests and waiting registrations, then the queue.
pub fn decide_registration(input: &RowInput<'_>, guests: &[Known<'_>], pending: &[Known<'_>]) -> RegistrationVerdict {
    let input = RowInput { category: None, ..*input };
    let row = match check_row(&input, MAX_REGISTRATION_SEATS) {
        Ok(row) => row,
        Err(reason) => return RegistrationVerdict::Invalid(reason),
    };
    let taken: HashSet<String> =
        guests.iter().chain(pending).flat_map(|person| roster_keys(person.name, person.phone)).collect();
    if taken.contains(&duplicate_key(&row)) {
        return RegistrationVerdict::Duplicate;
    }
    if pending.len() >= MAX_PENDING_REGISTRATIONS {
        return RegistrationVerdict::Full;
    }
    RegistrationVerdict::Ok(row)
}
