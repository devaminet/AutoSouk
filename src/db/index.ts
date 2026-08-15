import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schema } from "./schema";

const { NODE_ENV, TEST_DB_CONNECTION_STRING, DATABASE_URL } = process.env;

export const pool = new Pool({
  connectionString:
    NODE_ENV === "test" ? TEST_DB_CONNECTION_STRING : DATABASE_URL,
});

export const db = drizzle(pool, {
  schema,
});
