ALTER TABLE "coverage_requests" DROP CONSTRAINT "coverage_requests_home_id_homes_id_fk";
--> statement-breakpoint
ALTER TABLE "message_photos" DROP CONSTRAINT "message_photos_home_id_homes_id_fk";
--> statement-breakpoint
ALTER TABLE "message_reads" DROP CONSTRAINT "message_reads_home_id_homes_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_home_id_homes_id_fk";
--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_home_id_homes_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule_slots" DROP CONSTRAINT "schedule_slots_home_id_homes_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule_templates" DROP CONSTRAINT "schedule_templates_home_id_homes_id_fk";
--> statement-breakpoint
ALTER TABLE "homes" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_photos" ADD CONSTRAINT "message_photos_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;