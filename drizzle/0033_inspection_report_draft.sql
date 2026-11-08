ALTER TABLE "inspections" ADD COLUMN "report_draft" jsonb;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "report_draft_saved_at" timestamp;