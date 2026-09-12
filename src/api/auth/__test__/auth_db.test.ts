import { createUser, findUserByEmail, findUserById } from "../db";

describe("auth user role lookups", () => {
  it("returns the related role name when finding a user by email", async () => {
    const email = `auth-db-email-${Date.now()}@autosouk.com`;
    await createUser({
      firstName: "Auth",
      lastName: "Email",
      email,
      password: "Auth_@@7890",
      phone: "+212600000020",
      userType: "buyer",
      cityId: 1,
    });

    const user = await findUserByEmail(email);

    expect(user).toEqual(
      expect.objectContaining({
        email,
        role: expect.objectContaining({ name: "buyer" }),
      }),
    );
  });

  it("returns the related role name when finding a user by ID", async () => {
    const createdUserId = await createUser({
      firstName: "Auth",
      lastName: "ID",
      email: `auth-db-id-${Date.now()}@autosouk.com`,
      password: "Auth_@@7890",
      phone: "+212600000021",
      userType: "seller",
      cityId: 1,
    });

    const user = await findUserById(createdUserId);

    expect(user).toEqual(
      expect.objectContaining({
        id: createdUserId,
        role: expect.objectContaining({ name: "seller" }),
      }),
    );
  });
});
