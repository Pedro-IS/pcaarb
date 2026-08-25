ALTER TABLE "tenants" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo" "bytea";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "logo_mime_type" text;