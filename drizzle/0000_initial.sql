CREATE TYPE "public"."audit_action" AS ENUM('INSERT', 'UPDATE', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."candidate_reply" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."charting_preset" AS ENUM('therap', 'default');--> statement-breakpoint
CREATE TYPE "public"."coverage_status" AS ENUM('searching', 'filled', 'unfilled');--> statement-breakpoint
CREATE TYPE "public"."health_entry_kind" AS ENUM('vitals', 'seizure', 'illness', 'appointment');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('Low', 'Medium', 'High');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'reviewed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."incident_type" AS ENUM('Seizure', 'Medication error', 'Injury', 'Fall', 'Left without staff', 'Behavior with harm', 'Property damage', 'Other');--> statement-breakpoint
CREATE TYPE "public"."mar_status" AS ENUM('given', 'refused', 'held');--> statement-breakpoint
CREATE TYPE "public"."med_history_action" AS ENUM('added', 'updated', 'stopped');--> statement-breakpoint
CREATE TYPE "public"."note_status" AS ENUM('draft', 'submitted', 'approved', 'returned');--> statement-breakpoint
CREATE TYPE "public"."note_type" AS ENUM('shift', 'behavior');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent', 'read', 'failed', 'escalated', 'escalation_exhausted', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('inquiry', 'touring', 'accepted', 'waitlist', 'declined', 'placed');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('available', 'occupied', 'reserved');--> statement-breakpoint
CREATE TYPE "public"."shift_key" AS ENUM('am', 'pm', 'on');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('open', 'filled', 'filling');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('caregiver', 'supervisor', 'admin');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"charting_preset" charting_preset DEFAULT 'default' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"subscription_tier" text DEFAULT 'starter' NOT NULL,
	"enabled_features" text[] DEFAULT '{}',
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"scope" text DEFAULT 'read' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"day" date NOT NULL,
	"services" text[],
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"recorded_by_name" text,
	"created_by" uuid,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"performed_by" uuid,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" text,
	"body" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_health_info" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"allergies" text,
	"conditions" text,
	"diet" text,
	"doctor" text,
	"guardian" text,
	"dob" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid,
	"name" text NOT NULL,
	"first_name" text,
	"initials" text,
	"info" text,
	"behaviors" text[],
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clock_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"clock_in_at" timestamp with time zone NOT NULL,
	"clock_in_lat" real,
	"clock_in_lng" real,
	"clock_out_at" timestamp with time zone,
	"clock_out_lat" real,
	"clock_out_lng" real,
	"accuracy" real,
	"reason" text,
	"verified" boolean DEFAULT false NOT NULL,
	"manual_override" boolean DEFAULT false NOT NULL,
	"distance_meters" real,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"coverage_request_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"eligible" boolean DEFAULT false NOT NULL,
	"eligibility_reason" text,
	"reply" "candidate_reply" DEFAULT 'pending' NOT NULL,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"day" date NOT NULL,
	"shift" "shift_key" NOT NULL,
	"called_out_by" uuid,
	"reason" text,
	"status" "coverage_status" DEFAULT 'searching' NOT NULL,
	"started_at" timestamp with time zone,
	"filled_by" uuid,
	"filled_at" timestamp with time zone,
	"created_by" uuid,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"coverage_request_id" uuid NOT NULL,
	"home_id" uuid,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"email" text NOT NULL,
	"reason" text NOT NULL,
	"suppressed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"table_name" text,
	"record_id" uuid,
	"event_type" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb,
	"home_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"area" text NOT NULL,
	"text" text NOT NULL,
	"steps" text[],
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"area" text NOT NULL,
	"text" text NOT NULL,
	"steps" text[],
	"frequency" text,
	"target" text,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"kind" "health_entry_kind" NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"flags" text[],
	"acknowledged" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"lat" real,
	"lng" real,
	"radius" integer DEFAULT 150 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"author_id" uuid,
	"author_name" text,
	"type" "incident_type" NOT NULL,
	"severity" "incident_severity" DEFAULT 'Low' NOT NULL,
	"occurred_at" timestamp with time zone,
	"location" text,
	"description" text NOT NULL,
	"antecedent" text,
	"injured" text,
	"injury_detail" text,
	"staff_action" text,
	"medical_followup" text,
	"witnesses" text,
	"notified_parties" text[],
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"followup_notes" text,
	"created_by" uuid,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mar_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"medication_id" uuid NOT NULL,
	"day" date NOT NULL,
	"scheduled_time" time,
	"status" "mar_status" NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" uuid,
	"recorded_by_name" text,
	"reason" text,
	"effect" text,
	"is_prn" boolean DEFAULT false NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"amends_id" uuid,
	"conflict_with" uuid,
	"created_by" uuid,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"medication_id" uuid NOT NULL,
	"action" "med_history_action" NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"name" text NOT NULL,
	"dose" text,
	"route" text,
	"scheduled_times" time[],
	"prn_instructions" text,
	"notes" text,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"from_name" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"home_id" uuid,
	"goal_id" uuid NOT NULL,
	"trials" text[],
	"not_attempted" boolean DEFAULT false NOT NULL,
	"reason" text,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"note_id" uuid NOT NULL,
	"action" text NOT NULL,
	"by_name" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"home_id" uuid,
	"author_id" uuid,
	"author_name" text,
	"day" date NOT NULL,
	"shift" "shift_key" NOT NULL,
	"type" "note_type" NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb,
	"status" "note_status" DEFAULT 'draft' NOT NULL,
	"supervisor_comment" text,
	"lomi_drafted" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"notification_type" text NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"channel" text NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"reference_id" uuid,
	"reference_type" text,
	"provider_message_id" text,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"auth_uid" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"name" text NOT NULL,
	"initials" text,
	"role" "user_role" DEFAULT 'caregiver' NOT NULL,
	"home_ids" uuid[],
	"med_certified" boolean DEFAULT false NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"client_name" text,
	"source" text,
	"status" "referral_status" DEFAULT 'inquiry' NOT NULL,
	"assigned_home_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"requested_by" uuid,
	"type" text NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'queued' NOT NULL,
	"storage_path" text,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"name" text NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"occupied_by" uuid,
	"status" "room_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"home_id" uuid NOT NULL,
	"day" date NOT NULL,
	"shift" "shift_key" NOT NULL,
	"assigned_to" uuid,
	"status" "slot_status" DEFAULT 'open' NOT NULL,
	"via_lomi" boolean DEFAULT false NOT NULL,
	"device_sync" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"table_name" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"checkpoint_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"theme" text DEFAULT 'auto' NOT NULL,
	"quiet_hours_start" time,
	"quiet_hours_end" time,
	"disclosure" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"webhook_id" uuid NOT NULL,
	"event" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_code" integer,
	"response_time_ms" integer,
	"attempted_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"description" text,
	"secret_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_performed_by_profiles_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_info" ADD CONSTRAINT "client_health_info_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_info" ADD CONSTRAINT "client_health_info_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_info" ADD CONSTRAINT "client_health_info_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_records" ADD CONSTRAINT "clock_records_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_records" ADD CONSTRAINT "clock_records_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clock_records" ADD CONSTRAINT "clock_records_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_candidates" ADD CONSTRAINT "coverage_candidates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_candidates" ADD CONSTRAINT "coverage_candidates_coverage_request_id_coverage_requests_id_fk" FOREIGN KEY ("coverage_request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_candidates" ADD CONSTRAINT "coverage_candidates_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_called_out_by_profiles_id_fk" FOREIGN KEY ("called_out_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_filled_by_profiles_id_fk" FOREIGN KEY ("filled_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_requests" ADD CONSTRAINT "coverage_requests_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_steps" ADD CONSTRAINT "coverage_steps_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_steps" ADD CONSTRAINT "coverage_steps_coverage_request_id_coverage_requests_id_fk" FOREIGN KEY ("coverage_request_id") REFERENCES "public"."coverage_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_steps" ADD CONSTRAINT "coverage_steps_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_templates" ADD CONSTRAINT "goal_templates_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_entries" ADD CONSTRAINT "health_entries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_entries" ADD CONSTRAINT "health_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_entries" ADD CONSTRAINT "health_entries_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_entries" ADD CONSTRAINT "health_entries_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_entries" ADD CONSTRAINT "health_entries_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homes" ADD CONSTRAINT "homes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_amends_id_mar_records_id_fk" FOREIGN KEY ("amends_id") REFERENCES "public"."mar_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_conflict_with_mar_records_id_fk" FOREIGN KEY ("conflict_with") REFERENCES "public"."mar_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mar_records" ADD CONSTRAINT "mar_records_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_history" ADD CONSTRAINT "medication_history_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_history" ADD CONSTRAINT "medication_history_medication_id_medications_id_fk" FOREIGN KEY ("medication_id") REFERENCES "public"."medications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_history" ADD CONSTRAINT "medication_history_changed_by_profiles_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_goals" ADD CONSTRAINT "note_goals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_goals" ADD CONSTRAINT "note_goals_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_goals" ADD CONSTRAINT "note_goals_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_goals" ADD CONSTRAINT "note_goals_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_history" ADD CONSTRAINT "note_history_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_history" ADD CONSTRAINT "note_history_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_assigned_home_id_homes_id_fk" FOREIGN KEY ("assigned_home_id") REFERENCES "public"."homes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_jobs" ADD CONSTRAINT "report_jobs_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_occupied_by_clients_id_fk" FOREIGN KEY ("occupied_by") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_home_id_homes_id_fk" FOREIGN KEY ("home_id") REFERENCES "public"."homes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_checkpoints" ADD CONSTRAINT "sync_checkpoints_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_checkpoints" ADD CONSTRAINT "sync_checkpoints_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."webhooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_slug_idx" ON "agencies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "api_keys_agency_id_idx" ON "api_keys" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "attendance_home_id_idx" ON "attendance" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "attendance_agency_id_idx" ON "attendance" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_client_id_day_idx" ON "attendance" USING btree ("client_id","day");--> statement-breakpoint
CREATE INDEX "audit_log_agency_id_idx" ON "audit_log" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "audit_log_table_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "audit_log_performed_by_idx" ON "audit_log" USING btree ("performed_by");--> statement-breakpoint
CREATE INDEX "case_notes_agency_id_idx" ON "case_notes" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "case_notes_client_id_idx" ON "case_notes" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_health_info_home_id_idx" ON "client_health_info" USING btree ("home_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_health_info_client_id_idx" ON "client_health_info" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_health_info_agency_id_idx" ON "client_health_info" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "clients_agency_id_idx" ON "clients" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "clients_home_id_idx" ON "clients" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "clock_records_agency_id_idx" ON "clock_records" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "clock_records_profile_id_idx" ON "clock_records" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "clock_records_home_id_idx" ON "clock_records" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "coverage_candidates_agency_id_idx" ON "coverage_candidates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "coverage_candidates_request_id_idx" ON "coverage_candidates" USING btree ("coverage_request_id");--> statement-breakpoint
CREATE INDEX "coverage_candidates_profile_id_idx" ON "coverage_candidates" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "coverage_requests_agency_id_idx" ON "coverage_requests" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "coverage_requests_home_id_day_idx" ON "coverage_requests" USING btree ("home_id","day");--> statement-breakpoint
CREATE INDEX "coverage_steps_home_id_idx" ON "coverage_steps" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "coverage_steps_agency_id_idx" ON "coverage_steps" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "coverage_steps_request_id_idx" ON "coverage_steps" USING btree ("coverage_request_id");--> statement-breakpoint
CREATE INDEX "device_tokens_agency_id_idx" ON "device_tokens" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "device_tokens_profile_id_idx" ON "device_tokens" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_idx" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "email_suppressions_agency_id_idx" ON "email_suppressions" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_suppressions_agency_email_idx" ON "email_suppressions" USING btree ("agency_id","email");--> statement-breakpoint
CREATE INDEX "events_agency_id_idx" ON "events" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "events_home_id_idx" ON "events" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "events_event_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "goal_templates_agency_id_idx" ON "goal_templates" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "goals_home_id_idx" ON "goals" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "goals_agency_id_idx" ON "goals" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "goals_client_id_idx" ON "goals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "health_entries_home_id_idx" ON "health_entries" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "health_entries_agency_id_idx" ON "health_entries" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "health_entries_client_id_idx" ON "health_entries" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "homes_agency_id_idx" ON "homes" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "incidents_agency_id_idx" ON "incidents" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "incidents_client_id_idx" ON "incidents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "incidents_home_id_idx" ON "incidents" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "incidents_severity_idx" ON "incidents" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "mar_records_home_id_idx" ON "mar_records" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "mar_records_agency_id_idx" ON "mar_records" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "mar_records_client_id_day_idx" ON "mar_records" USING btree ("client_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "mar_records_client_med_day_slot_idx" ON "mar_records" USING btree ("client_id","medication_id","day","scheduled_time") WHERE is_prn = false AND amends_id IS NULL AND conflict_with IS NULL;--> statement-breakpoint
CREATE INDEX "medication_history_agency_id_idx" ON "medication_history" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "medication_history_medication_id_idx" ON "medication_history" USING btree ("medication_id");--> statement-breakpoint
CREATE INDEX "medications_home_id_idx" ON "medications" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "medications_agency_id_idx" ON "medications" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "medications_client_id_idx" ON "medications" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "messages_agency_id_idx" ON "messages" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "messages_home_id_idx" ON "messages" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "note_goals_home_id_idx" ON "note_goals" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "note_goals_agency_id_idx" ON "note_goals" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "note_goals_note_id_idx" ON "note_goals" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "note_goals_goal_id_idx" ON "note_goals" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "note_history_agency_id_idx" ON "note_history" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "note_history_note_id_idx" ON "note_history" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "notes_agency_id_idx" ON "notes" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "notes_client_id_day_shift_idx" ON "notes" USING btree ("client_id","day","shift");--> statement-breakpoint
CREATE INDEX "notes_home_id_day_idx" ON "notes" USING btree ("home_id","day");--> statement-breakpoint
CREATE INDEX "notes_author_id_idx" ON "notes" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "notes_status_idx" ON "notes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_prefs_agency_id_idx" ON "notification_preferences" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "notification_prefs_profile_id_idx" ON "notification_preferences" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_profile_type_idx" ON "notification_preferences" USING btree ("profile_id","notification_type");--> statement-breakpoint
CREATE INDEX "notifications_agency_id_idx" ON "notifications" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "notifications_profile_channel_created_idx" ON "notifications" USING btree ("profile_id","channel","created_at");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notifications_provider_message_id_idx" ON "notifications" USING btree ("provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_auth_uid_idx" ON "profiles" USING btree ("auth_uid");--> statement-breakpoint
CREATE INDEX "profiles_agency_id_idx" ON "profiles" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "profiles_email_idx" ON "profiles" USING btree ("email");--> statement-breakpoint
CREATE INDEX "referrals_agency_id_idx" ON "referrals" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "referrals_status_idx" ON "referrals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "report_jobs_agency_id_idx" ON "report_jobs" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "report_jobs_requested_by_idx" ON "report_jobs" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "rooms_agency_id_idx" ON "rooms" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "rooms_home_id_idx" ON "rooms" USING btree ("home_id");--> statement-breakpoint
CREATE INDEX "schedule_slots_agency_id_idx" ON "schedule_slots" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_slots_agency_day_shift_home_idx" ON "schedule_slots" USING btree ("agency_id","day","shift","home_id");--> statement-breakpoint
CREATE INDEX "schedule_slots_home_id_day_idx" ON "schedule_slots" USING btree ("home_id","day");--> statement-breakpoint
CREATE INDEX "schedule_slots_assigned_to_idx" ON "schedule_slots" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "sync_checkpoints_agency_id_idx" ON "sync_checkpoints" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "sync_checkpoints_profile_id_idx" ON "sync_checkpoints" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "user_settings_agency_id_idx" ON "user_settings" USING btree ("agency_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_settings_profile_id_idx" ON "user_settings" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_agency_id_idx" ON "webhook_deliveries" USING btree ("agency_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_webhook_id_idx" ON "webhook_deliveries" USING btree ("webhook_id");--> statement-breakpoint
CREATE INDEX "webhooks_agency_id_idx" ON "webhooks" USING btree ("agency_id");