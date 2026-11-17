import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../../app";
import { db } from "../../../db";
import { inspectionTable } from "../../../db/schema/inspection";
import { usersTable } from "../../../db/schema/user";
import { signinUser, testUserCredentials } from "../../../test/helpers";
import * as fileUtils from "../../../utils/functions";
import { createApprovedCar, createBuyer, createMechanic } from "../../inspections/__test__/fixtures";

const signinAdmin = () => signinUser({ email: "admin@autosouk.com", password: "Admin_@@789" });

const userIdOf = async (email: string) => {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  return user!.id;
};

const login = (email: string) =>
  request(app).post("/api/auth/login").send({ email, password: testUserCredentials.password });

describe("admin dashboard", () => {
  let admin: Awaited<ReturnType<typeof signinAdmin>>;

  beforeEach(async () => {
    admin = await signinAdmin();
  });

  const asAdmin = (method: "get" | "post" | "delete", path: string) =>
    request(app)[method](path).auth(admin.accessToken, { type: "bearer" });

  it("is for admins only", async () => {
    const buyer = await createBuyer("buyer@example.com");

    await request(app).get("/api/admin/overview").expect(401);
    await request(app).get("/api/admin/users").auth(buyer.accessToken, { type: "bearer" }).expect(403);
  });

  it("counts the whole site and what waits for an admin", async () => {
    await createApprovedCar("seller@example.com");
    await createBuyer("buyer@example.com");

    const { body } = await asAdmin("get", "/api/admin/overview").expect(200);

    expect(body.users).toEqual({
      total: 3,
      byRole: { buyer: 1, seller: 1, mechanic: 0, admin: 1 },
      suspended: 0,
    });
    expect(body.listings.byStatus).toMatchObject({ approved: 1, pending: 0, draft: 0 });
    expect(body.inspections.byStatus).toMatchObject({ pending: 0, completed: 0 });
    expect(body.mechanics).toEqual({ total: 0, bookable: 0 });
    expect(body.queues).toEqual({ verifications: 0, listings: 0, identityChecks: 0, mechanicDocuments: 0 });
  });

  it("finds users by role and search, and shows one in full", async () => {
    await createBuyer("buyer@example.com");
    await createApprovedCar("seller@example.com");

    const sellers = await asAdmin("get", "/api/admin/users?role=seller").expect(200);
    expect(sellers.body.users.map((user: { email: string }) => user.email)).toEqual(["seller@example.com"]);
    expect(sellers.body.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });

    const found = await asAdmin("get", "/api/admin/users?search=BUYER@").expect(200);
    expect(found.body.users).toHaveLength(1);
    expect(found.body.users[0]).toMatchObject({ email: "buyer@example.com", role: "buyer", suspendedAt: null });

    const sellerId = await userIdOf("seller@example.com");
    const { body } = await asAdmin("get", `/api/admin/users/${sellerId}`).expect(200);
    expect(body).toMatchObject({
      email: "seller@example.com",
      role: "seller",
      signedInDevices: 1,
      mechanic: null,
      listings: { byStatus: { approved: 1 } },
    });
    expect(body).not.toHaveProperty("password");

    await asAdmin("get", "/api/admin/users/999999").expect(404);
  });

  it("suspends an account: no sign-in, sessions end, listings hidden, until reactivated", async () => {
    const { listingId } = await createApprovedCar("seller@example.com");
    const seller = await signinUser({ email: "seller@example.com" });
    const sellerId = await userIdOf("seller@example.com");

    await asAdmin("post", `/api/admin/users/${sellerId}/suspend`).send({ reason: "" }).expect(400);
    const suspended = await asAdmin("post", `/api/admin/users/${sellerId}/suspend`)
      .send({ reason: "Fake listings" })
      .expect(200);
    expect(suspended.body).toMatchObject({ suspensionReason: "Fake listings" });
    expect(suspended.body.history[0]).toMatchObject({ action: "user.suspended", details: { reason: "Fake listings" } });
    // The seller learns why, by email.
    const templates = (fileUtils.readTemplateFile as jest.Mock).mock.calls;
    expect(templates.at(-1)).toEqual([
      "account_status.ejs",
      expect.objectContaining({ key: "account_suspended", reason: "Fake listings", firstName: "John" }),
    ]);
    expect(fileUtils.sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: "seller@example.com", subject: "Your AutoSouk account is suspended" }),
    );

    // The token they hold no longer works, and they can't sign in again.
    await request(app).get("/api/listings/mine").auth(seller.accessToken, { type: "bearer" }).expect(401);
    const refused = await login("seller@example.com").expect(403);
    expect(refused.body.errors[0].code).toBe("auth.account_suspended");

    // Buyers no longer see the listing; admins still do.
    const listings = await request(app).get("/api/listings").expect(200);
    expect(listings.body.listings).toEqual([]);
    await request(app).get(`/api/listings/${listingId}`).expect(404);
    await asAdmin("get", `/api/listings/${listingId}`).expect(200);

    const filtered = await asAdmin("get", "/api/admin/users?status=suspended").expect(200);
    expect(filtered.body.users.map((user: { id: number }) => user.id)).toEqual([sellerId]);
    await asAdmin("post", `/api/admin/users/${sellerId}/suspend`).send({ reason: "Again" }).expect(400);

    await asAdmin("post", `/api/admin/users/${sellerId}/reactivate`).expect(200);
    expect(fileUtils.sendMail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: "seller@example.com", subject: "Your AutoSouk account is active again" }),
    );
    await login("seller@example.com").expect(200);
    await request(app).get(`/api/listings/${listingId}`).expect(200);
    await asAdmin("post", `/api/admin/users/${sellerId}/reactivate`).expect(400);
  });

  it("hides a suspended mechanic from buyers", async () => {
    const { mechanic } = await createMechanic("mechanic@example.com");
    await request(app).get(`/api/mechanics/${mechanic.id}`).expect(200);

    const userId = await userIdOf("mechanic@example.com");
    await asAdmin("post", `/api/admin/users/${userId}/suspend`).send({ reason: "Fraud" }).expect(200);

    await request(app).get(`/api/mechanics/${mechanic.id}`).expect(404);
    const { body } = await asAdmin("get", "/api/admin/mechanics").expect(200);
    expect(body.mechanics[0]).toMatchObject({ id: mechanic.id, bookable: false, awaitingReview: false });
  });

  it("never acts on the admin's own account or another admin", async () => {
    const adminId = await userIdOf("admin@autosouk.com");

    const self = await asAdmin("post", `/api/admin/users/${adminId}/suspend`).send({ reason: "Test" }).expect(400);
    expect(self.body.errors[0].code).toBe("admin.cannot_act_on_self");
    await asAdmin("delete", `/api/admin/users/${adminId}`).send({ reason: "Test" }).expect(400);
  });

  it("deletes an account and keeps the record", async () => {
    await createBuyer("buyer@example.com");
    const buyerId = await userIdOf("buyer@example.com");

    await asAdmin("delete", `/api/admin/users/${buyerId}`).send({ reason: "Asked by the user" }).expect(200);

    await asAdmin("get", `/api/admin/users/${buyerId}`).expect(404);
    await login("buyer@example.com").expect(401);
    const log = await asAdmin("get", `/api/admin/audit-log?targetType=user&targetId=${buyerId}`).expect(200);
    expect(log.body.entries[0]).toMatchObject({
      action: "user.deleted",
      details: { reason: "Asked by the user", email: "buyer@example.com", role: "buyer" },
      actor: { firstName: "autosouk" },
    });
    expect(log.body.actions).toContain("user.deleted");
  });

  it("keeps a mechanic whose inspections buyers rely on", async () => {
    const { carId } = await createApprovedCar("seller@example.com");
    const { mechanic } = await createMechanic("mechanic@example.com");
    const buyerId = (await createBuyer("buyer@example.com")).user.id;
    await db.insert(inspectionTable).values({ carId, buyerId, mechanicId: mechanic.id, priceAtRequest: 300 });
    const userId = await userIdOf("mechanic@example.com");

    const { body } = await asAdmin("delete", `/api/admin/users/${userId}`).send({ reason: "Test" }).expect(400);
    expect(body.errors[0].code).toBe("admin.user_has_inspections");

    const inspections = await asAdmin("get", "/api/admin/inspections?status=pending").expect(200);
    expect(inspections.body.inspections).toHaveLength(1);
    expect(inspections.body.inspections[0]).toMatchObject({
      status: "pending",
      buyer: { id: buyerId },
      mechanic: { id: mechanic.id },
      car: { id: carId },
      hasReport: false,
    });
  });

  it("lists listings in every status and deletes one", async () => {
    const { listingId } = await createApprovedCar("seller@example.com");

    const { body } = await asAdmin("get", "/api/admin/listings?status=approved&search=black").expect(200);
    expect(body.listings).toHaveLength(1);
    expect(body.listings[0]).toMatchObject({
      id: listingId,
      status: "approved",
      seller: { email: "seller@example.com" },
      car: { price: 500000, year: 2025 },
    });

    await asAdmin("delete", `/api/admin/listings/${listingId}`).send({ reason: "Scam" }).expect(200);
    await asAdmin("get", `/api/listings/${listingId}`).expect(404);
    await asAdmin("delete", `/api/admin/listings/${listingId}`).send({ reason: "Scam" }).expect(404);
  });

  it("keeps the buyers' inspections and reports when the seller is deleted", async () => {
    const { carId } = await createApprovedCar("seller@example.com");
    const { mechanic } = await createMechanic("mechanic@example.com");
    const buyer = await createBuyer("buyer@example.com");
    const otherBuyer = await createBuyer("other@example.com");
    await db.insert(inspectionTable).values([
      {
        carId,
        buyerId: buyer.user.id,
        mechanicId: mechanic.id,
        priceAtRequest: 300,
        status: "completed",
        reportPdfLink: "report-1.pdf",
        carMake: "Ford",
        carModel: "Focus",
        carYear: 2025,
      },
      { carId, buyerId: otherBuyer.user.id, mechanicId: mechanic.id, priceAtRequest: 300 },
    ]);
    const sellerId = await userIdOf("seller@example.com");

    await asAdmin("delete", `/api/admin/users/${sellerId}`).send({ reason: "Fraud" }).expect(200);

    const mine = await request(app).get("/api/inspections").auth(buyer.accessToken, { type: "bearer" }).expect(200);
    expect(mine.body.inspections).toHaveLength(1);
    expect(mine.body.inspections[0]).toMatchObject({
      status: "completed",
      reportPdfLink: expect.any(String),
      car: { id: null, removed: true, year: 2025, make: { name: "Ford" }, model: { name: "Focus" }, seller: null },
    });
    const one = await request(app)
      .get(`/api/inspections/${mine.body.inspections[0].id}`)
      .auth(buyer.accessToken, { type: "bearer" })
      .expect(200);
    expect(one.body.inspection.car).toMatchObject({ removed: true, year: 2025 });
    // The one not finished yet is cancelled.
    const other = await request(app).get("/api/inspections").auth(otherBuyer.accessToken, { type: "bearer" }).expect(200);
    expect(other.body.inspections[0]).toMatchObject({ status: "cancelled", car: { removed: true } });
    const all = await asAdmin("get", "/api/admin/inspections").expect(200);
    expect(all.body.inspections.map((inspection: { car: { removed: boolean } }) => inspection.car.removed)).toEqual([
      true,
      true,
    ]);
  });
});
