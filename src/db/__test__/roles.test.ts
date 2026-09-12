import { eq } from "drizzle-orm";
import { db, pool } from "../../db";
import { rolesTable } from "../../db/schema/roles";
import { usersTable } from "../../db/schema/user";

describe("roles database model", () => {
  it("enforces unique role names", async () => {
    await expect(
      db.insert(rolesTable).values({ name: "buyer" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("loads users from roles and roles from users", async () => {
    const [buyerRole] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.name, "buyer"));
    if (!buyerRole) {
      throw new Error("buyer role was not seeded");
    }

    const email = `role-relation-${Date.now()}@autosouk.com`;
    const [user] = await db
      .insert(usersTable)
      .values({
        firstName: "Role",
        lastName: "Relation",
        email,
        password: "hashed-password",
        salt: "salt",
        phone: "+212600000001",
        roleId: buyerRole.id,
      })
      .returning({ id: usersTable.id });

    const roleWithUsers = await db.query.rolesTable.findFirst({
      where: eq(rolesTable.id, buyerRole.id),
      with: { users: true },
    });
    const userWithRole = await db.query.usersTable.findFirst({
      where: eq(usersTable.id, user.id),
      with: { role: true },
    });

    expect(
      roleWithUsers?.users.some((relatedUser) => relatedUser.id === user.id),
    ).toBe(true);
    expect(userWithRole?.role.name).toBe("buyer");
  });

  it("rejects users that reference a missing role", async () => {
    await expect(
      db.insert(usersTable).values({
        firstName: "Invalid",
        lastName: "Role",
        email: `invalid-role-${Date.now()}@autosouk.com`,
        password: "hashed-password",
        salt: "salt",
        phone: "+212600000002",
        roleId: 2147483647,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("aborts legacy migration when a user role is missing or unsupported", async () => {
    const client = await pool.connect();

    try {
      await client.query(`
        CREATE TEMP TABLE users (
          id integer,
          email varchar,
          role varchar
        )
      `);
      await client.query(
        `INSERT INTO users (id, email, role) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [1, "invalid@example.com", "unknown", 2, "missing@example.com", null],
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
            FROM users
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
        detail: expect.stringContaining("invalid@example.com"),
      });

      await client.query("ROLLBACK");
      const { rows } = await client.query("SELECT * FROM users");
      expect(rows).toHaveLength(2);
    } finally {
      await client.query("DROP TABLE IF EXISTS users");
      client.release();
    }
  });

  it("backfills role IDs for valid legacy users", async () => {
    const client = await pool.connect();

    try {
      await client.query(`
        CREATE TEMP TABLE roles (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          name varchar(50) NOT NULL UNIQUE
        )
      `);
      await client.query(`
        CREATE TEMP TABLE users (
          id integer,
          email varchar,
          role varchar,
          role_id integer
        )
      `);
      await client.query(
        `INSERT INTO users (id, email, role) VALUES ($1, $2, $3), ($4, $5, $6)`,
        [1, "buyer@example.com", "buyer", 2, "admin@example.com", "admin"],
      );
      await client.query(`
        INSERT INTO roles (name)
        SELECT DISTINCT role
        FROM users
        WHERE role IS NOT NULL
        ON CONFLICT (name) DO NOTHING
      `);
      await client.query(`
        UPDATE users
        SET role_id = roles.id
        FROM roles
        WHERE users.role = roles.name
      `);

      const { rows } = await client.query(
        "SELECT users.email, roles.name FROM users JOIN roles ON users.role_id = roles.id ORDER BY users.id",
      );
      expect(rows).toEqual([
        { email: "buyer@example.com", name: "buyer" },
        { email: "admin@example.com", name: "admin" },
      ]);
    } finally {
      await client.query("DROP TABLE IF EXISTS users, roles");
      client.release();
    }
  });
});
