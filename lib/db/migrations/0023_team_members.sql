CREATE TABLE "invitation_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"role" varchar(16) NOT NULL,
	"label" varchar(60) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"user_id" integer,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_members_role_check" CHECK ("invitation_members"."role" in ('cohost', 'usher'))
);
--> statement-breakpoint
ALTER TABLE "invitation_members" ADD CONSTRAINT "invitation_members_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_members" ADD CONSTRAINT "invitation_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_members_token_unique" ON "invitation_members" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_members_live_grant_unique" ON "invitation_members" USING btree ("invitation_id","user_id") WHERE "invitation_members"."user_id" is not null and "invitation_members"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "invitation_members_user_idx" ON "invitation_members" USING btree ("user_id") WHERE "invitation_members"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "invitation_members_invitation_idx" ON "invitation_members" USING btree ("invitation_id","created_at");