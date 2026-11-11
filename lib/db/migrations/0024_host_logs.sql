CREATE TABLE "gift_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"guest_id" integer,
	"giver_name" varchar(150) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"amount" bigint,
	"note" varchar(300),
	"received_at" timestamp DEFAULT now() NOT NULL,
	"request_key" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gift_logs_kind_check" CHECK ("gift_logs"."kind" in ('envelope', 'present', 'transfer', 'other')),
	CONSTRAINT "gift_logs_amount_check" CHECK ("gift_logs"."amount" is null or "gift_logs"."amount" between 0 and 1000000000000)
);
--> statement-breakpoint
CREATE TABLE "guest_logs" (
	"guest_id" integer PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"table_id" integer,
	"seat" varchar(20),
	"souvenir_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seating_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"name" varchar(60) NOT NULL,
	"capacity" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seating_tables_capacity_check" CHECK ("seating_tables"."capacity" is null or "seating_tables"."capacity" between 1 and 100)
);
--> statement-breakpoint
ALTER TABLE "gift_logs" ADD CONSTRAINT "gift_logs_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_logs" ADD CONSTRAINT "gift_logs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_logs" ADD CONSTRAINT "guest_logs_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_logs" ADD CONSTRAINT "guest_logs_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_logs" ADD CONSTRAINT "guest_logs_table_id_seating_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."seating_tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seating_tables" ADD CONSTRAINT "seating_tables_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gift_logs_request_unique" ON "gift_logs" USING btree ("invitation_id","request_key");--> statement-breakpoint
CREATE INDEX "gift_logs_invitation_idx" ON "gift_logs" USING btree ("invitation_id","received_at");--> statement-breakpoint
CREATE INDEX "guest_logs_invitation_idx" ON "guest_logs" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "guest_logs_table_idx" ON "guest_logs" USING btree ("table_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seating_tables_invitation_name_unique" ON "seating_tables" USING btree ("invitation_id","name");