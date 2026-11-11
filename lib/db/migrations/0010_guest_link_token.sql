ALTER TABLE "guests" ADD COLUMN "link_token" varchar(32);--> statement-breakpoint
CREATE UNIQUE INDEX "guests_link_token_unique" ON "guests" USING btree ("link_token");