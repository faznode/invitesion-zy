ALTER TABLE "invitations" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "purge_after" timestamp;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "purged_at" timestamp;--> statement-breakpoint
CREATE INDEX "invitations_purge_due_idx" ON "invitations" USING btree ("purge_after") WHERE "invitations"."deleted_at" is not null and "invitations"."purged_at" is null;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_deletion_window_check" CHECK (("invitations"."deleted_at" is null) = ("invitations"."purge_after" is null) and ("invitations"."purge_after" is null or "invitations"."purge_after" >= "invitations"."deleted_at"));--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_purged_check" CHECK ("invitations"."purged_at" is null or "invitations"."deleted_at" is not null);