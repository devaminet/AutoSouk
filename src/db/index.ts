import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as cars from "./schema/car";
import * as listings from "./schema/listing";
import * as carMedias from "./schema/car_media";
import * as carOrigins from "./schema/car_origin";
import * as carCarburants from "./schema/carburant";
import * as carMakes from "./schema/car_make";
import * as carModels from "./schema/car_model";
import * as carStates from "./schema/state";

const { NODE_ENV, TEST_DB_CONNECTION_STRING, DATABASE_URL } = process.env;

export const pool = new Pool({
  connectionString:
    NODE_ENV === "test" ? TEST_DB_CONNECTION_STRING : DATABASE_URL,
});

export const db = drizzle(pool, {
  schema: {
    ...cars,
    ...listings,
    ...carMedias,
    ...carOrigins,
    ...carCarburants,
    ...carMakes,
    ...carModels,
    ...carStates,
  },
});
