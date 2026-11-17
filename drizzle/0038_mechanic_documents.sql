CREATE TYPE "public"."mechanic_document_status" AS ENUM('uploading', 'uploaded', 'pending', 'approved', 'rejected', 'replaced');--> statement-breakpoint
CREATE TYPE "public"."mechanic_document_type" AS ENUM('cin_front', 'cin_back', 'rc', 'patente', 'ice', 'premises');--> statement-breakpoint
CREATE TYPE "public"."mechanic_kind" AS ENUM('solo', 'garage');--> statement-breakpoint
CREATE TABLE "mechanic_documents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mechanic_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"type" "mechanic_document_type" NOT NULL,
	"status" "mechanic_document_status" DEFAULT 'uploading' NOT NULL,
	"file_name" varchar NOT NULL,
	"content_type" varchar(50) NOT NULL,
	"size_bytes" bigint,
	"valid_until" date,
	"rejection_reason" varchar(500),
	"submitted_at" timestamp,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"file_deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mechanic_verifications" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"kind" "mechanic_kind" NOT NULL,
	"approved_at" timestamp,
	"valid_until" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mechanic_documents" ADD CONSTRAINT "mechanic_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanic_documents" ADD CONSTRAINT "mechanic_documents_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanic_verifications" ADD CONSTRAINT "mechanic_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mechanic_documents_user_id_idx" ON "mechanic_documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mechanic_documents_status_idx" ON "mechanic_documents" USING btree ("status");