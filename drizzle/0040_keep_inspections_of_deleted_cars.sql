ALTER TABLE "inspections" DROP CONSTRAINT "inspections_car_id_cars_id_fk";
--> statement-breakpoint
ALTER TABLE "inspections" ALTER COLUMN "car_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "car_make" varchar;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "car_model" varchar;--> statement-breakpoint
ALTER TABLE "inspections" ADD COLUMN "car_year" integer;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "inspections" AS "i"
SET "car_make" = "mk"."name", "car_model" = "md"."name", "car_year" = "c"."year"
FROM "cars" AS "c"
LEFT JOIN "makes" AS "mk" ON "mk"."id" = "c"."make_id"
LEFT JOIN "models" AS "md" ON "md"."id" = "c"."model_id"
WHERE "c"."id" = "i"."car_id";
