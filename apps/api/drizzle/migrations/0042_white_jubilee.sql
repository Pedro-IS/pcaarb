ALTER TABLE "stores" ADD COLUMN "receipt_paper_width_mm" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "receipt_auto_print" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "printer_label" text;