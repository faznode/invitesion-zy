CREATE TABLE "agent_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"version_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"guest_id" integer,
	"event_type" varchar(20) NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"customer_phone" varchar(30),
	"invitation_id" integer,
	"channel" varchar(20) DEFAULT 'wa' NOT NULL,
	"state" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_memory" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"preferensi" jsonb,
	"last_interaction_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customer_memory_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "customer_session_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"conversation_id" integer,
	"invitation_id" integer,
	"summary" varchar(300) NOT NULL,
	"next_action" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"guest_id" integer,
	"name" varchar(150) NOT NULL,
	"message" text NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"name" varchar(150) NOT NULL,
	"slug" varchar(150) NOT NULL,
	"phone" varchar(30),
	"category" varchar(50),
	"qr_code" text,
	"sent_at" timestamp,
	"opened_at" timestamp,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"rsvp_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"checked_in_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "intake_session" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer,
	"event_type" varchar(20),
	"slots" jsonb,
	"template_id" integer,
	"palette_id" varchar(50),
	"status" varchar(20) DEFAULT 'in_progress' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"version_no" integer NOT NULL,
	"config" jsonb,
	"created_by" varchar(20) NOT NULL,
	"is_live" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"template_id" integer,
	"slug" varchar(120) NOT NULL,
	"event_type" varchar(20) NOT NULL,
	"config" jsonb,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"url" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"sender_type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"invitation_id" integer,
	"tier" varchar(50),
	"amount" integer NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"midtrans_order_id" varchar(120) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orders_midtrans_order_id_unique" UNIQUE("midtrans_order_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"provider" varchar(50) NOT NULL,
	"transaction_id" varchar(120),
	"status" varchar(30),
	"raw_payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"category" varchar(20) NOT NULL,
	"default_config" jsonb,
	"thumbnail" text,
	"is_premium" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100),
	"email" varchar(255) NOT NULL,
	"phone" varchar(30),
	"password_hash" text NOT NULL,
	"role" varchar(20) DEFAULT 'CUSTOMER' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "wa_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"invitation_id" integer,
	"guest_id" integer,
	"direction" varchar(10) NOT NULL,
	"status" varchar(30),
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_version_id_invitation_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."invitation_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_memory" ADD CONSTRAINT "customer_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_session_summary" ADD CONSTRAINT "customer_session_summary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_session_summary" ADD CONSTRAINT "customer_session_summary_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_session_summary" ADD CONSTRAINT "customer_session_summary_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_messages" ADD CONSTRAINT "guest_messages_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_messages" ADD CONSTRAINT "guest_messages_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_session" ADD CONSTRAINT "intake_session_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intake_session" ADD CONSTRAINT "intake_session_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_versions" ADD CONSTRAINT "invitation_versions_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_log" ADD CONSTRAINT "wa_log_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_log" ADD CONSTRAINT "wa_log_guest_id_guests_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guests_invitation_slug_unique" ON "guests" USING btree ("invitation_id","slug");