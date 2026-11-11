CREATE TABLE "workspace_credit_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"operation_key" varchar(80) NOT NULL,
	"kind" varchar(12) NOT NULL,
	"delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"invitation_id" integer,
	"actor_user_id" integer,
	"note" varchar(200),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_credit_entries_kind_check" CHECK (("workspace_credit_entries"."kind" = 'debit' and "workspace_credit_entries"."delta" < 0) or ("workspace_credit_entries"."kind" = 'grant' and "workspace_credit_entries"."delta" > 0)),
	CONSTRAINT "workspace_credit_entries_balance_check" CHECK ("workspace_credit_entries"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"label" varchar(60) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"user_id" integer,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_role_check" CHECK ("workspace_members"."role" in ('manager', 'desk'))
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"owner_user_id" integer NOT NULL,
	"credit_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"disabled_at" timestamp,
	CONSTRAINT "workspaces_credit_balance_check" CHECK ("workspaces"."credit_balance" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "workspace_id" integer;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "client_label" varchar(80);--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_credit_entries" ADD CONSTRAINT "workspace_credit_entries_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_credit_entries_operation_unique" ON "workspace_credit_entries" USING btree ("workspace_id","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_token_unique" ON "workspace_members" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_live_grant_unique" ON "workspace_members" USING btree ("workspace_id","user_id") WHERE "workspace_members"."user_id" is not null and "workspace_members"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id") WHERE "workspace_members"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_idx" ON "workspace_members" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workspaces_owner_unique" ON "workspaces" USING btree ("owner_user_id");--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_workspace_idx" ON "invitations" USING btree ("workspace_id") WHERE "invitations"."workspace_id" is not null;