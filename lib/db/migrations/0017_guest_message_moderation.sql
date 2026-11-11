ALTER TABLE "guest_messages" ADD COLUMN "reviewed_at" timestamp;--> statement-breakpoint
ALTER TABLE "guest_messages" ADD COLUMN "host_reply" text;--> statement-breakpoint
ALTER TABLE "guest_messages" ADD COLUMN "replied_at" timestamp;--> statement-breakpoint
CREATE INDEX "guest_messages_invitation_visible_idx" ON "guest_messages" USING btree ("invitation_id","is_hidden","created_at");