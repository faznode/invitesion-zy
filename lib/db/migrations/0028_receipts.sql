CREATE TABLE "receipt_counters" (
	"scope" varchar(20) PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"order_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"reference" varchar(120) NOT NULL,
	"tier" varchar(50),
	"amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"rail" varchar(20) NOT NULL,
	"transaction_id" varchar(200),
	"paid_at" timestamp NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_number_unique" UNIQUE("number"),
	CONSTRAINT "receipts_order_unique" UNIQUE("order_id"),
	CONSTRAINT "receipts_payment_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_user_number_idx" ON "receipts" USING btree ("user_id","number");