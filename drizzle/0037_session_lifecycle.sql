ALTER TABLE "refresh_tokens" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "ended_at" timestamp;