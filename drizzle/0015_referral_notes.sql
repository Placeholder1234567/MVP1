CREATE TABLE "referral_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"referral_id" uuid NOT NULL,
	"status" "referral_status" NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"author_name" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "referral_notes" ADD CONSTRAINT "referral_notes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_notes" ADD CONSTRAINT "referral_notes_referral_id_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_notes" ADD CONSTRAINT "referral_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_notes" ADD CONSTRAINT "referral_notes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_notes_agency_id_idx" ON "referral_notes" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "referral_notes_referral_id_idx" ON "referral_notes" USING btree ("referral_id");