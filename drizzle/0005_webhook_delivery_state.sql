ALTER TABLE "webhook_deliveries" ADD COLUMN "audit_id" uuid;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "secret_sealed" text;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_webhook_audit_idx" ON "webhook_deliveries" USING btree ("webhook_id","audit_id");