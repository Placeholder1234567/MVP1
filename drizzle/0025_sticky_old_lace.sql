CREATE TABLE "disclosures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"disclosed_on" date NOT NULL,
	"recipient" text NOT NULL,
	"recipient_address" text,
	"description" text NOT NULL,
	"purpose" text NOT NULL,
	"purpose_detail" text,
	"recorded_by" uuid,
	"recorded_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disclosures" ADD CONSTRAINT "disclosures_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disclosures_agency_id_idx" ON "disclosures" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "disclosures_client_id_idx" ON "disclosures" USING btree ("client_id","disclosed_on");