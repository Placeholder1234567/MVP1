CREATE TABLE "controlled_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" real NOT NULL,
	"expected" real,
	"discrepancy" boolean DEFAULT false NOT NULL,
	"reason" text,
	"recorded_by" uuid NOT NULL,
	"recorded_by_name" text NOT NULL,
	"witness_id" uuid,
	"witness_name" text,
	"witness_status" text DEFAULT 'none' NOT NULL,
	"witnessed_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "controlled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "controlled_schedule" text;--> statement-breakpoint
ALTER TABLE "medications" ADD COLUMN "units_per_dose" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "controlled_counts" ADD CONSTRAINT "controlled_counts_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_counts" ADD CONSTRAINT "controlled_counts_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_counts" ADD CONSTRAINT "controlled_counts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_counts" ADD CONSTRAINT "controlled_counts_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_counts" ADD CONSTRAINT "controlled_counts_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "controlled_counts" ADD CONSTRAINT "controlled_counts_witness_id_profiles_id_fk" FOREIGN KEY ("witness_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "controlled_counts_agency_id_idx" ON "controlled_counts" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "controlled_counts_home_id_idx" ON "controlled_counts" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "controlled_counts_medication_idx" ON "controlled_counts" USING btree ("medication_id","recorded_at");--> statement-breakpoint
CREATE INDEX "controlled_counts_witness_idx" ON "controlled_counts" USING btree ("witness_id","witness_status");