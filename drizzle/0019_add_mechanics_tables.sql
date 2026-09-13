CREATE TABLE "mechanic_garage_images" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mechanic_garage_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mechanic_id" integer NOT NULL,
	"link" varchar NOT NULL,
	"created_at" date DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mechanics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mechanics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"name" varchar NOT NULL,
	"city_id" integer NOT NULL,
	"address" varchar NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"description" varchar,
	"phone" varchar,
	"inspection_price" integer,
	"profile_image_url" varchar,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" date DEFAULT now() NOT NULL,
	"updated_at" date DEFAULT now() NOT NULL,
	CONSTRAINT "mechanics_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "mechanics_latitude_range" CHECK ("mechanics"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "mechanics_longitude_range" CHECK ("mechanics"."longitude" BETWEEN -180 AND 180)
);
--> statement-breakpoint
ALTER TABLE "mechanic_garage_images" ADD CONSTRAINT "mechanic_garage_images_mechanic_id_mechanics_id_fk" FOREIGN KEY ("mechanic_id") REFERENCES "public"."mechanics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanics" ADD CONSTRAINT "mechanics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mechanics" ADD CONSTRAINT "mechanics_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mechanic_garage_images_mechanic_id_idx" ON "mechanic_garage_images" USING btree ("mechanic_id");--> statement-breakpoint
CREATE INDEX "mechanics_city_id_idx" ON "mechanics" USING btree ("city_id");