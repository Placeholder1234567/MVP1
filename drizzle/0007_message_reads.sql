CREATE TABLE "message_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"reader_name" text NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_reads_agency_id_idx" ON "message_reads" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "message_reads_home_id_idx" ON "message_reads" USING btree ("home_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_reads_message_profile_idx" ON "message_reads" USING btree ("message_id","profile_id");