//! G-052 (D-067) against a database migrated by drizzle-kit (`TEST_DATABASE_URL`): the writers' access clause
//! (`members::caller_may`) for workspace staff. A `manager` holds the co-host's writer capabilities and a `desk` the
//! usher's on every live client invitation of the workspace, and nothing anywhere else: not on the owner's personal
//! invitations, not on another workspace's, not on an invitation whose owner does not own the workspace, and nothing
//! once revoked, while the workspace is disabled, after the invitation is taken back or deleted. The same rule runs in
//! TypeScript (`callerMay` in `roster-next.ts`, `scripts/verify-workspaces.ts`). Fixture rows are fictional, tagged per
//! run and removed before the assertions.

use invitesion_api::members::{Capability, caller_may};
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;

struct Fixture {
    pool: PgPool,
    tag: String,
    users: Vec<i32>,
    workspaces: Vec<i32>,
    invitations: Vec<i32>,
}

impl Fixture {
    async fn new() -> Self {
        let url =
            std::env::var("TEST_DATABASE_URL").expect("TEST_DATABASE_URL must name a database migrated by drizzle-kit");
        let pool = PgPoolOptions::new().max_connections(2).connect(&url).await.expect("connect");
        let tag = uuid::Uuid::new_v4().simple().to_string()[..10].to_owned();
        Self { pool, tag, users: vec![], workspaces: vec![], invitations: vec![] }
    }

    async fn user(&mut self, label: &str) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into users (email, clerk_user_id, role) values ($1, $2, 'CUSTOMER') returning id",
        )
        .bind(format!("ws-{label}-{}@example.invalid", self.tag))
        .bind(format!("user_ws_{label}_{}", self.tag))
        .fetch_one(&self.pool)
        .await
        .expect("user");
        self.users.push(id);
        id
    }

    async fn workspace(&mut self, owner: i32) -> i32 {
        let id: i32 = sqlx::query_scalar("insert into workspaces (name, owner_user_id) values ($1, $2) returning id")
            .bind(format!("Ruang {}", self.tag))
            .bind(owner)
            .fetch_one(&self.pool)
            .await
            .expect("workspace");
        self.workspaces.push(id);
        id
    }

    async fn invitation(&mut self, owner: i32, label: &str, workspace: Option<i32>) -> i32 {
        let id: i32 = sqlx::query_scalar(
            "insert into invitations (user_id, slug, event_type, status, config, workspace_id, client_label) \
             values ($1, $2, 'wedding', 'DRAFT', '{}'::jsonb, $3, 'Klien Fiktif') returning id",
        )
        .bind(owner)
        .bind(format!("ws-{label}-{}", self.tag))
        .bind(workspace)
        .fetch_one(&self.pool)
        .await
        .expect("invitation");
        self.invitations.push(id);
        id
    }

    async fn member(&self, workspace: i32, user: i32, role: &str) -> i32 {
        sqlx::query_scalar(
            "insert into workspace_members (workspace_id, role, label, token_hash, expires_at, user_id, accepted_at) \
             values ($1, $2, 'Staf', $3, now(), $4, now()) returning id",
        )
        .bind(workspace)
        .bind(role)
        .bind(format!("{:0>64}", format!("{}{}{}", self.tag, user, role)))
        .bind(user)
        .fetch_one(&self.pool)
        .await
        .expect("member")
    }

    async fn run(&self, statement: &'static str, a: i32, b: Option<i32>) {
        sqlx::query(statement).bind(a).bind(b).execute(&self.pool).await.expect(statement);
    }

    async fn may(&self, user: i32, invitation: i32, capability: Capability) -> bool {
        let mut tx = self.pool.begin().await.expect("begin");
        let verdict = caller_may(&mut tx, user, invitation, capability).await.expect("caller_may").is_some();
        tx.rollback().await.expect("rollback");
        verdict
    }

    async fn cleanup(&self) {
        let invitations = &self.invitations[..];
        let workspaces = &self.workspaces[..];
        let users = &self.users[..];
        sqlx::query("delete from workspace_members where workspace_id = any($1)")
            .bind(workspaces)
            .execute(&self.pool)
            .await
            .expect("members");
        sqlx::query("delete from invitations where id = any($1)")
            .bind(invitations)
            .execute(&self.pool)
            .await
            .expect("invitations");
        sqlx::query("delete from workspaces where id = any($1)")
            .bind(workspaces)
            .execute(&self.pool)
            .await
            .expect("workspaces");
        sqlx::query("delete from users where id = any($1)").bind(users).execute(&self.pool).await.expect("users");
    }
}

#[tokio::test]
async fn workspace_staff_reach_the_writers_through_their_role_and_nowhere_else() {
    let mut f = Fixture::new().await;
    let owner = f.user("owner").await;
    let manager = f.user("manager").await;
    let desk = f.user("desk").await;
    let outsider = f.user("outsider").await;
    let other_owner = f.user("other").await;
    let workspace = f.workspace(owner).await;
    let other_workspace = f.workspace(other_owner).await;
    let client = f.invitation(owner, "client", Some(workspace)).await;
    let personal = f.invitation(owner, "personal", None).await;
    let not_the_owners = f.invitation(other_owner, "foreign", Some(workspace)).await;
    let other_client = f.invitation(other_owner, "otherclient", Some(other_workspace)).await;
    let manager_row = f.member(workspace, manager, "manager").await;
    f.member(workspace, desk, "desk").await;
    f.member(other_workspace, outsider, "manager").await;

    let mut verdicts: Vec<(String, bool, bool)> = vec![];
    for capability in Capability::ALL {
        let name = capability.name();
        let desk_may = capability == Capability::Checkin;
        verdicts.push((format!("owner / {name}"), true, f.may(owner, client, capability).await));
        verdicts.push((format!("manager / {name}"), true, f.may(manager, client, capability).await));
        verdicts.push((format!("desk / {name}"), desk_may, f.may(desk, client, capability).await));
        verdicts.push((
            format!("manager on a personal invitation / {name}"),
            false,
            f.may(manager, personal, capability).await,
        ));
        verdicts.push((
            format!("manager where the workspace's owner is not the invitation's / {name}"),
            false,
            f.may(manager, not_the_owners, capability).await,
        ));
        verdicts.push((
            format!("manager on another workspace's invitation / {name}"),
            false,
            f.may(manager, other_client, capability).await,
        ));
        verdicts.push((
            format!("another workspace's manager / {name}"),
            false,
            f.may(outsider, client, capability).await,
        ));
    }

    f.run("update workspace_members set revoked_at = now() where id = $1 and $2::int is null", manager_row, None).await;
    for capability in Capability::ALL {
        verdicts.push((
            format!("revoked manager / {}", capability.name()),
            false,
            f.may(manager, client, capability).await,
        ));
    }
    verdicts.push(("desk, its colleague revoked".into(), true, f.may(desk, client, Capability::Checkin).await));

    f.run("update workspaces set disabled_at = now() where id = $1 and $2::int is null", workspace, None).await;
    verdicts.push(("desk, workspace disabled".into(), false, f.may(desk, client, Capability::Checkin).await));
    verdicts.push(("owner, workspace disabled".into(), true, f.may(owner, client, Capability::Guests).await));
    f.run("update workspaces set disabled_at = null where id = $1 and $2::int is null", workspace, None).await;
    verdicts.push(("desk, workspace enabled again".into(), true, f.may(desk, client, Capability::Checkin).await));

    f.run("update invitations set workspace_id = $2 where id = $1", client, None).await;
    verdicts.push(("desk, invitation taken back".into(), false, f.may(desk, client, Capability::Checkin).await));
    f.run("update invitations set workspace_id = $2 where id = $1", client, Some(workspace)).await;
    verdicts.push(("desk, invitation assigned again".into(), true, f.may(desk, client, Capability::Checkin).await));

    f.run(
        "update invitations set deleted_at = now(), purge_after = now() + interval '30 days' where id = $1 and $2::int is null",
        client,
        None,
    )
    .await;
    verdicts.push(("desk, invitation deleted".into(), false, f.may(desk, client, Capability::Checkin).await));
    verdicts.push(("owner, invitation deleted".into(), false, f.may(owner, client, Capability::Checkin).await));

    f.cleanup().await;
    let failed: Vec<&(String, bool, bool)> =
        verdicts.iter().filter(|(_, expected, actual)| expected != actual).collect();
    assert!(failed.is_empty(), "{} of {} verdicts differ: {failed:?}", failed.len(), verdicts.len());
    assert_eq!(verdicts.len(), 3 * 7 + 3 + 1 + 3 + 2 + 2);
}
