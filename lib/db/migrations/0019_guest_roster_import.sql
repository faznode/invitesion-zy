CREATE TABLE "guest_registration_links" (
	"invitation_id" integer PRIMARY KEY NOT NULL,
	"token" varchar(32) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"phone" varchar(30),
	"guest_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guests" ADD COLUMN "import_batch_id" varchar(36);--> statement-breakpoint
ALTER TABLE "guest_registration_links" ADD CONSTRAINT "guest_registration_links_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_registrations" ADD CONSTRAINT "guest_registrations_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_registration_links_token_unique" ON "guest_registration_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "guest_registrations_invitation_idx" ON "guest_registrations" USING btree ("invitation_id","created_at");--> statement-breakpoint
CREATE INDEX "guests_import_batch_idx" ON "guests" USING btree ("invitation_id","import_batch_id") WHERE "guests"."import_batch_id" is not null;