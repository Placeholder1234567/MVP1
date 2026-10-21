CREATE TYPE "public"."coverage_offer_evidence_event" AS ENUM('queued', 'provider_accepted', 'delivery_reported', 'failed', 'suppressed', 'rate_limited');--> statement-breakpoint
CREATE TABLE "coverage_offer_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"coverage_request_id" uuid NOT NULL,
	"notification_id" uuid,
	"recipient_profile_id" uuid,
	"channel" text NOT NULL,
	"event" "coverage_offer_evidence_event" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coverage_offer_evidence" ADD CONSTRAINT "coverage_offer_evidence_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_offer_evidence" ADD CONSTRAINT "coverage_offer_evidence_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_offer_evidence" ADD CONSTRAINT "coverage_offer_evidence_coverage_request_id_coverage_requests_id_fk" FOREIGN KEY ("coverage_request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_offer_evidence" ADD CONSTRAINT "coverage_offer_evidence_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_offer_evidence" ADD CONSTRAINT "coverage_offer_evidence_recipient_profile_id_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_offer_evidence_notification_event_idx" ON "coverage_offer_evidence" USING btree ("notification_id","event");--> statement-breakpoint
CREATE INDEX "coverage_offer_evidence_agency_home_request_idx" ON "coverage_offer_evidence" USING btree ("agency_id","home_id","coverage_request_id");