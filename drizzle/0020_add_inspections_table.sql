CREATE TYPE "public"."inspection_status" AS ENUM('pending', 'accepted', 'rejected', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inspection_verdict" AS ENUM('excellent', 'good', 'fair', 'poor');--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inspections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"car_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"mechanic_id" integer NOT NULL,
	"status" "inspection_status" DEFAULT 'pending' NOT NULL,
	"price_at_request" integer NOT NULL,
	"matricule" varchar,
	"carte_grise_number" varchar,
	"controle_technique_valid" boolean,
	"controle_technique_expiry" date,
	"vignette_valid" boolean,
	"verdict" "inspection_verdict",
	"overall_score" integer,
	"summary" varchar,
	"findings" jsonb,
	"report_pdf_link" varchar,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp,
	"completed_at" timestamp,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_mechanic_id_mechanics_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."mechanics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspections_car_id_idx" ON "inspections" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "inspections_mechanic_id_idx" ON "inspections" USING btree ("mechanic_id");--> statement-breakpoint
CREATE INDEX "inspections_buyer_id_idx" ON "inspections" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "inspections_status_idx" ON "inspections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "inspections_one_active_per_car" ON "inspections" USING btree ("car_id") WHERE "inspections"."status" IN ('pending','accepted','in_progress');