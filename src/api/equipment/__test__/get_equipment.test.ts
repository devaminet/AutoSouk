import request from "supertest";
import { app } from "../../../app";

type CatalogResponse = {
  categories: {
    id: number;
    slug: string;
    name: string;
    equipment: { id: number; slug: string; name: string }[];
  }[];
};

describe("GET /api/equipment", () => {
  it("returns the catalog grouped by category in display order", async () => {
    const response = await request(app).get("/api/equipment").expect(200);
    const { categories } = response.body as CatalogResponse;

    expect(categories.map(({ slug }) => slug)).toEqual([
      "safety",
      "driving_assistance",
      "comfort",
      "multimedia",
      "exterior",
    ]);
    expect(categories[0]).toEqual({
      id: expect.any(Number),
      slug: "safety",
      name: "Safety",
      equipment: expect.arrayContaining([
        { id: expect.any(Number), slug: "abs", name: "ABS" },
      ]),
    });
    expect(categories[0].equipment[0].slug).toBe("abs");
    expect(
      categories.reduce((total, { equipment }) => total + equipment.length, 0),
    ).toBe(72);
  });

  it("is public and cacheable", async () => {
    const response = await request(app).get("/api/equipment").expect(200);

    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
  });
});
