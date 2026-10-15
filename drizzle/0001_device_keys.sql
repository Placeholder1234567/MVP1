CREATE TABLE "device_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"key_ciphertext" text NOT NULL,
	"last_issued_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_keys" ADD CONSTRAINT "device_keys_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_keys" ADD CONSTRAINT "device_keys_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_keys_profile_device_idx" ON "device_keys" USING btree ("profile_id","device_id");--> statement-breakpoint
CREATE INDEX "device_keys_agency_id_idx" ON "device_keys" USING btree ("agency_id");