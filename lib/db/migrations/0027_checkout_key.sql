ALTER TABLE "orders" ADD COLUMN "checkout_key" varchar(64);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "checkout_intent" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX "orders_user_checkout_key_idx" ON "orders" USING btree ("user_id","invitation_id","checkout_key") WHERE "orders"."checkout_key" is not null;