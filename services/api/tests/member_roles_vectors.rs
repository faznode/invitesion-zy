//! G-044 parity (D-057): the team vectors the TypeScript suite runs (`tests/g044-team-access.test.ts`), run here against
//! the writers' capability table (`members::Capability`) and the guest operations' capabilities: the capabilities the
//! writers enforce, the member roles each allows, every role's verdict for each of them, and which capability each guest
//! operation needs.

use invitesion_api::members::Capability;
use invitesion_api::roster::http::GuestOperation;
use serde_json::Value;

fn vectors() -> Value {
    serde_json::from_str(include_str!("../../../contracts/vectors/member-roles.json"))
        .expect("member-roles.json parses")
}

fn capability_named(name: &str) -> Capability {
    Capability::ALL.into_iter().find(|capability| capability.name() == name).unwrap_or_else(|| panic!("{name}"))
}

#[test]
fn the_writers_enforce_exactly_the_typescript_capabilities_with_the_same_roles() {
    let v = vectors();
    let writers = v["writers"].as_array().expect("writers");
    let names: Vec<&str> = writers.iter().map(|w| w["capability"].as_str().expect("name")).collect();
    let ours: Vec<&str> = Capability::ALL.iter().map(|capability| capability.name()).collect();
    assert_eq!(ours, names, "the same capabilities, in the same order");
    for writer in writers {
        let capability = capability_named(writer["capability"].as_str().expect("name"));
        let roles: Vec<&str> =
            writer["memberRoles"].as_array().expect("roles").iter().map(|r| r.as_str().expect("role")).collect();
        assert_eq!(capability.member_roles(), roles.as_slice(), "{}", capability.name());
        assert_eq!(capability.member_role_args(), roles.iter().map(|r| (*r).to_owned()).collect::<Vec<_>>());
    }
}

#[test]
fn every_role_gets_the_typescript_verdict_for_every_writer_capability() {
    let v = vectors();
    let mut checked = 0;
    for row in v["matrix"].as_array().expect("matrix") {
        let role = row["role"].as_str().expect("role");
        for capability in Capability::ALL {
            let expected = row["capabilities"][capability.name()].as_bool().expect("verdict");
            let ours = role == "owner" || capability.member_roles().contains(&role);
            assert_eq!(ours, expected, "{role} / {}", capability.name());
            checked += 1;
        }
    }
    assert_eq!(checked, 9, "owner, co-host and usher, each against three capabilities");
}

#[test]
fn the_workspace_clause_allows_exactly_the_typescript_workspace_roles() {
    let v = vectors();
    let writers = v["workspace"]["writers"].as_array().expect("workspace writers");
    assert_eq!(writers.len(), Capability::ALL.len());
    for writer in writers {
        let capability = capability_named(writer["capability"].as_str().expect("name"));
        let roles: Vec<&str> =
            writer["workspaceRoles"].as_array().expect("roles").iter().map(|r| r.as_str().expect("role")).collect();
        assert_eq!(capability.workspace_roles(), roles.as_slice(), "{}", capability.name());
        assert_eq!(capability.workspace_role_args(), roles.iter().map(|r| (*r).to_owned()).collect::<Vec<_>>());
    }
    assert_eq!(v["workspace"]["asMember"]["manager"], "cohost");
    assert_eq!(v["workspace"]["asMember"]["desk"], "usher");
}

#[test]
fn every_guest_operation_needs_the_typescript_capability() {
    let v = vectors();
    let operations = v["operations"].as_array().expect("operations");
    assert_eq!(operations.len(), 3);
    for entry in operations {
        let operation: GuestOperation = serde_json::from_value(entry["api"].clone()).expect("an API operation name");
        assert_eq!(
            operation.capability().name(),
            entry["capability"].as_str().expect("capability"),
            "{}",
            entry["api"]
        );
    }
}
