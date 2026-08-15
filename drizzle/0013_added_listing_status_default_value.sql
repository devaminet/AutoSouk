ALTER TABLE "listings" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "status" DROP NOT NULL;