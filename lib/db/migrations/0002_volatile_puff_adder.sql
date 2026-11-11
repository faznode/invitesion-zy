ALTER TABLE "users" ADD COLUMN "whatsapp" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "instagram" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "x_handle" varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "marketing_consent" boolean DEFAULT false NOT NULL;