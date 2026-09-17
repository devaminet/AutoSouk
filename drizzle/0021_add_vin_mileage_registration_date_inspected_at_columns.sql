ALTER TABLE "inspections" ADD COLUMN "vin" varchar;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "mileage" integer;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "first_registration_date" date;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "inspected_at" timestamp;