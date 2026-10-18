CREATE TABLE "message_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "photo_id" uuid;--> statement-breakpoint
ALTER TABLE "message_photos" ADD CONSTRAINT "message_photos_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_photos" ADD CONSTRAINT "message_photos_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_photos" ADD CONSTRAINT "message_photos_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_photos_agency_id_idx" ON "message_photos" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "message_photos_home_id_idx" ON "message_photos" USING btree ("home_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_photo_id_message_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."message_photos"("id") ON DELETE set null ON UPDATE no action;