CREATE TABLE "api_idempotency_keys" (
	"scope" varchar(120) NOT NULL,
	"key" varchar(255) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "api_idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"bucket" varchar(120) PRIMARY KEY NOT NULL,
	"window_start" timestamp NOT NULL,
	"hits" integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_idempotency_keys_created_idx" ON "api_idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "api_rate_limits_window_idx" ON "api_rate_limits" USING btree ("window_start");