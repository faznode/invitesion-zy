ALTER TABLE "orders" DROP CONSTRAINT "orders_midtrans_order_id_unique";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "transaction_id" SET DATA TYPE varchar(200);--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "midtrans_order_id";