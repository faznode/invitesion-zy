CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" varchar(40) NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"locked_until" timestamp,
	"last_error" varchar(500),
	"done_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"source_key" varchar(512) NOT NULL,
	"variant_key" varchar(512) NOT NULL,
	"format" varchar(10) NOT NULL,
	"tier" varchar(10) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_variants" ADD CONSTRAINT "media_variants_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_kind_dedupe_unique" ON "jobs" USING btree ("kind","dedupe_key");--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("run_at") WHERE "jobs"."done_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "media_variants_source_unique" ON "media_variants" USING btree ("source_key","tier","format","width");--> statement-breakpoint
CREATE INDEX "media_variants_invitation_idx" ON "media_variants" USING btree ("invitation_id");