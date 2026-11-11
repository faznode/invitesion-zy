ALTER TABLE "invitations" ADD COLUMN "guest_passcode_hash" varchar(200);--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "guest_passcode_set_at" timestamp;