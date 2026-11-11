CREATE TABLE "coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"kind" varchar(10) NOT NULL,
	"percent_off" integer,
	"amount_off" integer,
	"currency" varchar(3),
	"tier" varchar(50),
	"starts_at" timestamp,
	"ends_at" timestamp,
	"max_redemptions" integer,
	"per_customer" integer DEFAULT 1 NOT NULL,
	"stackable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"partner" varchar(64),
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"disabled_at" timestamp,
	CONSTRAINT "coupons_code_unique" UNIQUE("code"),
	CONSTRAINT "coupons_kind_check" CHECK ("coupons"."kind" in ('percent', 'fixed')),
	CONSTRAINT "coupons_value_check" CHECK (("coupons"."kind" = 'percent' and "coupons"."percent_off" between 1 and 99 and "coupons"."amount_off" is null) or ("coupons"."kind" = 'fixed' and "coupons"."amount_off" >= 1 and "coupons"."percent_off" is null and "coupons"."currency" in ('IDR', 'USD'))),
	CONSTRAINT "coupons_limits_check" CHECK ("coupons"."per_customer" >= 1 and ("coupons"."max_redemptions" is null or "coupons"."max_redemptions" >= 1)),
	CONSTRAINT "coupons_window_check" CHECK ("coupons"."starts_at" is null or "coupons"."ends_at" is null or "coupons"."starts_at" < "coupons"."ends_at")
);
--> statement-breakpoint
CREATE TABLE "order_coupons" (
	"order_id" integer NOT NULL,
	"coupon_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"discount" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "order_coupons_pk" PRIMARY KEY("order_id","coupon_id"),
	CONSTRAINT "order_coupons_discount_check" CHECK ("order_coupons"."discount" >= 0 and "order_coupons"."position" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "list_amount" integer;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_coupons" ADD CONSTRAINT "order_coupons_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_coupons" ADD CONSTRAINT "order_coupons_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_coupons" ADD CONSTRAINT "order_coupons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_coupons_coupon_user_idx" ON "order_coupons" USING btree ("coupon_id","user_id");