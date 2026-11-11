CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"rail" varchar(20) NOT NULL,
	"event_id" varchar(200) NOT NULL,
	"order_id" integer,
	"status" varchar(30),
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_rail_event_unique" UNIQUE("rail","event_id")
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currency" varchar(3) DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rail" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reference" varchar(120) NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider_payment_id" varchar(200);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_reference_unique" UNIQUE("reference");