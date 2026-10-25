CREATE TABLE "car_equipment" (
	"car_id" integer NOT NULL,
	"equipment_id" integer NOT NULL,
	CONSTRAINT "car_equipment_car_id_equipment_id_pk" PRIMARY KEY("car_id","equipment_id")
);
--> statement-breakpoint
CREATE TABLE "equipment_categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "equipment_categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" varchar NOT NULL,
	"name" varchar NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "equipment_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "equipment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"slug" varchar NOT NULL,
	"name" varchar NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "equipment_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "car_equipment" ADD CONSTRAINT "car_equipment_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "car_equipment" ADD CONSTRAINT "car_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_category_id_equipment_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "car_equipment_equipment_id_idx" ON "car_equipment" USING btree ("equipment_id");