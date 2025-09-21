CREATE TABLE "car_media" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "car_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"car_id" integer NOT NULL,
	"link" varchar NOT NULL,
	"type" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "car_media" ADD CONSTRAINT "car_media_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;