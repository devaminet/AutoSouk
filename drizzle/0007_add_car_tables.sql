CREATE TABLE "car_origins" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "car_origins_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"origin" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cars" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cars_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"make_id" integer,
	"model_id" integer,
	"carburant_id" integer,
	"origin_id" integer,
	"state_id" integer,
	"price" integer NOT NULL,
	"year" integer NOT NULL,
	"owners_count" integer NOT NULL,
	"city" varchar NOT NULL,
	"distance" varchar NOT NULL,
	"transmission" varchar NOT NULL,
	"fiscal_power" integer NOT NULL,
	"doors_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carburants" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "carburants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"carburant" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_states" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "car_states_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"state" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_make_id_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."makes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_carburant_id_carburants_id_fk" FOREIGN KEY ("carburant_id") REFERENCES "public"."carburants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_origin_id_car_origins_id_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."car_origins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_state_id_car_states_id_fk" FOREIGN KEY ("state_id") REFERENCES "public"."car_states"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "make_fk" FOREIGN KEY ("make_id") REFERENCES "public"."makes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "model_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "carburant_fk" FOREIGN KEY ("carburant_id") REFERENCES "public"."carburants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "origin_fk" FOREIGN KEY ("origin_id") REFERENCES "public"."car_origins"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "state_fk" FOREIGN KEY ("state_id") REFERENCES "public"."car_states"("id") ON DELETE no action ON UPDATE no action;