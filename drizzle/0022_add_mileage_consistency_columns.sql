CREATE TYPE "public"."mileage_consistency" AS ENUM('consistent', 'suspicious', 'unverifiable');--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "mileage_consistency" "mileage_consistency";--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "mileage_consistency_note" varchar;