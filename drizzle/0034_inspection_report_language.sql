ALTER TABLE "inspections" ADD COLUMN "report_language" varchar DEFAULT 'fr' NOT NULL;--> statement-breakpoint
-- Inspections asked before this change keep the buyer's language.
UPDATE "inspections" SET "report_language" = "users"."locale" FROM "users" WHERE "users"."id" = "inspections"."buyer_id";
