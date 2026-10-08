CREATE TABLE "mechanic_reviews" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mechanic_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mechanic_id" integer NOT NULL,
	"buyer_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"message" varchar,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date DEFAULT now() NOT NULL,
	CONSTRAINT "mechanic_reviews_rating_range" CHECK ("mechanic_reviews"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "mechanic_reviews" ADD CONSTRAINT "mechanic_reviews_mechanic_id_mechanics_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."mechanics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanic_reviews" ADD CONSTRAINT "mechanic_reviews_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mechanic_reviews_mechanic_id_idx" ON "mechanic_reviews" USING btree ("mechanic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mechanic_reviews_one_per_buyer" ON "mechanic_reviews" USING btree ("mechanic_id","buyer_id");