CREATE TABLE "email_bounces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_bounces" ADD CONSTRAINT "email_bounces_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_inbound_messages" ADD CONSTRAINT "sms_inbound_messages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_bounces_agency_id_idx" ON "email_bounces" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "email_bounces_lookup_idx" ON "email_bounces" USING btree ("agency_id","email","created_at");--> statement-breakpoint
CREATE INDEX "sms_inbound_messages_agency_id_idx" ON "sms_inbound_messages" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_inbound_messages_message_id_idx" ON "sms_inbound_messages" USING btree ("message_id");