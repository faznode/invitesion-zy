ALTER TABLE "media_assets" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "upload_sequence" integer;--> statement-breakpoint
ALTER TABLE "media_assets" ADD COLUMN "source" varchar(20) DEFAULT 'web' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_invitation_sequence_unique" ON "media_assets" USING btree ("invitation_id","upload_sequence");