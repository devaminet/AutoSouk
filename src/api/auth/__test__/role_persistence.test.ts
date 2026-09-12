import { sql } from "drizzle-orm";
import { db } from "../../../db";
import { usersTable } from "../../../db/schema/user";
import { findRoles, findUserByEmail, insertUserWithRoleId } from "../db";

const userValues = {
  firstName: "Role",
  lastName: "Persistence",
  password: "hashed-password",
  salt: "salt",
  phone: "+212600000010",
  isVerified: true,
};

describe("user role persistence", () => {
  it("creates users for every seeded role and resolves their role names", async () => {
    const roles = (await findRoles()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    const emails = roles.map(({ name }) => `role-${name}@autosouk.com`);

    await Promise.all(
      roles.map(({ id }, index) =>
        insertUserWithRoleId({
          firstName: userValues.firstName,
          lastName: userValues.lastName,
          email: emails[index],
          password: userValues.password,
          salt: userValues.salt,
          phone: userValues.phone,
          roleId: id,
          cityId: 1,
          isVerified: userValues.isVerified,
        }),
      ),
    );

    const usersWithRoles = await Promise.all(
      emails.map((email) => findUserByEmail(email)),
    );

    expect(usersWithRoles).toHaveLength(4);
    expect(usersWithRoles.map((user) => user?.role.name).sort()).toEqual([
      "admin",
      "buyer",
      "mechanic",
      "seller",
    ]);
  });

  it("rejects a user without a role ID", async () => {
    await expect(
      db.execute(sql`
        INSERT INTO users (
          first_name,
          last_name,
          email,
          password,
          salt,
          phone,
          is_verified
        ) VALUES (
          'Missing',
          'Role',
          'missing-role@autosouk.com',
          'hashed-password',
          'salt',
          '+212600000011',
          true
        )
      `),
    ).rejects.toMatchObject({ cause: { code: "23502" } });
  });

  it("rejects a user with a non-existent role ID", async () => {
    await expect(
      db.insert(usersTable).values({
        ...userValues,
        email: "unknown-role@autosouk.com",
        roleId: 2147483647,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });
});
