import request from "supertest";
import { app } from "../../../app";
import { resources } from "../../../i18n/resources";

const getLookups = async () => {
  const response = await request(app).get("/api/lookups").expect(200);
  return response;
};

const slugs = (items: { slug: string }[]) => items.map(({ slug }) => slug);

describe("GET /api/lookups", () => {
  it("does not require authentication and is cacheable", async () => {
    const response = await getLookups();

    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("returns the id, slug, name and area of every city, sorted by name", async () => {
    const { body } = await getLookups();
    const names = body.cities.map(({ name }: { name: string }) => name);

    expect(body.cities).toContainEqual({
      id: expect.any(Number),
      slug: "casablanca",
      name: "Casablanca",
      latitude: 33.5731,
      longitude: -7.5898,
      radiusKm: 20,
    });
    expect(names.indexOf("Agadir")).toBeLessThan(names.indexOf("Casablanca"));
    expect(names.indexOf("Casablanca")).toBeLessThan(names.indexOf("Zagora"));
  });

  it("returns fuels, states and origins as id and slug", async () => {
    const { body } = await getLookups();

    expect(body.carburants[0]).toEqual({
      id: expect.any(Number),
      slug: expect.any(String),
    });
    expect(slugs(body.carburants)).toContain("diesel");
    expect(slugs(body.states)).toContain("very_good");
    expect(slugs(body.origins)).toContain("imported_new");
  });

  it("returns slugs that the enums catalog can translate", async () => {
    const { body } = await getLookups();
    const { city, carburant, car_state, car_origin } = resources.ar.enums;

    expect(Object.keys(city)).toEqual(
      expect.arrayContaining(slugs(body.cities)),
    );
    expect(Object.keys(carburant)).toEqual(
      expect.arrayContaining(slugs(body.carburants)),
    );
    expect(Object.keys(car_state)).toEqual(
      expect.arrayContaining(slugs(body.states)),
    );
    expect(Object.keys(car_origin)).toEqual(
      expect.arrayContaining(slugs(body.origins)),
    );
  });

  it("returns city ids that registration accepts", async () => {
    const { body } = await getLookups();
    const registered = await request(app).post("/api/auth/register").send({
      firstName: "Amina",
      lastName: "Alaoui",
      email: "amina@example.com",
      password: "USEr_@@852852",
      phone: "+212600000000",
      userType: "buyer",
      cityId: body.cities[0].id,
    });

    expect(registered.statusCode).toBe(201);
  });
});
