ALTER TABLE "cars" ADD COLUMN "city_id" integer;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "city_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" DROP COLUMN "city";