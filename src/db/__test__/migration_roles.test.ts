import path from "path";
import { asc } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "../../db";
import { rolesTable } from "../schema/roles";
import { generateRolesData } from "../seeds/roles_seed";

describe("role migration and recovery", () => {
  it("can rerun migrations and seeds three times without changing seeded roles", async () => {
    const initialRoles = await db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .orderBy(asc(rolesTable.name));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await migrate(db, {
        migrationsFolder: path.join(path.resolve(), "/drizzle"),
      });
      await generateRolesData();
    }

    const finalRoles = await db
      .select({ id: rolesTable.id, name: rolesTable.name })
      .from(rolesTable)
      .orderBy(asc(rolesTable.name));

    expect(finalRoles).toEqual(initialRoles);
    expect(finalRoles).toHaveLength(4);
  });

  it("rolls back invalid legacy roles and succeeds after correction", async () => {
    const client = await pool.connect();

    try {
      await client.query(`
        CREATE TEMP TABLE legacy_users (
          id integer,
          email varchar NOT NULL,
          role varchar
        )
      `);
      await client.query(
        `INSERT INTO legacy_users (id, email, role) VALUES ($1, $2, $3)`,
        [1, "invalid-role@example.com", "unknown"],
      );

      await client.query("BEGIN");
      await expect(
        client.query(`
          DO $$
          DECLARE
            invalid_users text;
          BEGIN
            SELECT string_agg(
              format('id=%s, email=%s, role=%s', id, email, coalesce(role, '<null>')),
              '; '
            )
            INTO invalid_users
            FROM legacy_users
            WHERE role IS NULL
               OR role NOT IN ('buyer', 'seller', 'mechanic', 'admin');

            IF invalid_users IS NOT NULL THEN
              RAISE EXCEPTION 'Cannot migrate users with unsupported or missing roles'
                USING DETAIL = invalid_users;
            END IF;
          END $$;
        `),
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          "Cannot migrate users with unsupported or missing roles",
        ),
        detail: expect.stringContaining("invalid-role@example.com"),
      });
      await client.query("ROLLBACK");

      const invalidUser = await client.query(
        "SELECT role FROM legacy_users WHERE id = $1",
        [1],
      );
      expect(invalidUser.rows).toEqual([{ role: "unknown" }]);

      await client.query("UPDATE legacy_users SET role = $1 WHERE id = $2", [
        "buyer",
        1,
      ]);
      await client.query("BEGIN");
      await client.query(`
        DO $$
        DECLARE
          invalid_users text;
        BEGIN
          SELECT string_agg(
            format('id=%s, email=%s, role=%s', id, email, coalesce(role, '<null>')),
            '; '
          )
          INTO invalid_users
          FROM legacy_users
          WHERE role IS NULL
             OR role NOT IN ('buyer', 'seller', 'mechanic', 'admin');

          IF invalid_users IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot migrate users with unsupported or missing roles'
              USING DETAIL = invalid_users;
          END IF;
        END $$;
      `);
      await client.query("COMMIT");

      const correctedUser = await client.query(
        "SELECT role FROM legacy_users WHERE id = $1",
        [1],
      );
      expect(correctedUser.rows).toEqual([{ role: "buyer" }]);
    } finally {
      await client.query("DROP TABLE IF EXISTS legacy_users");
      client.release();
    }
  });
});
