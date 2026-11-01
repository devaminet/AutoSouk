import { db } from "../../db";
import { carTable } from "../../db/schema/car";
import { carOriginTable } from "../../db/schema/car_origin";
import { carCarburantTable } from "../../db/schema/carburant";
import { cityTable } from "../../db/schema/city";
import {
  equipmentCategoryTable,
  equipmentTable,
} from "../../db/schema/equipment";
import {
  inspectionStatusEnum,
  inspectionVerdictEnum,
  mileageConsistencyEnum,
} from "../../db/schema/inspection";
import { listingStatusEnum } from "../../db/schema/listing";
import { rolesTable } from "../../db/schema/roles";
import { carStateTable } from "../../db/schema/state";
import {
  inspectionCategorySchema,
  inspectionItemStatusSchema,
} from "../../api/inspections/request_schema";
import { getListingsQuerySchema } from "../../api/listings/request_schema";
import { sourceResources } from "../resources";

type EnumKind = keyof typeof sourceResources.enums;

const labelled = (kind: EnumKind) =>
  Object.keys(sourceResources.enums[kind]).sort();

const sorted = (values: readonly string[]) => [...values].sort();

// Each lookup value clients receive must have a label, and every label must
// still match a value, so the catalog never drifts from the data. The catalog
// test then guarantees French and Arabic have the same keys.
describe("enums catalog", () => {
  it.each<[EnumKind, () => Promise<string[]>]>([
    [
      "carburant",
      async () =>
        (await db.select().from(carCarburantTable)).map((row) => row.carburant),
    ],
    [
      "car_state",
      async () =>
        (await db.select().from(carStateTable)).map((row) => row.state),
    ],
    [
      "car_origin",
      async () =>
        (await db.select().from(carOriginTable)).map((row) => row.origin),
    ],
    [
      "city",
      async () => (await db.select().from(cityTable)).map((row) => row.slug),
    ],
    [
      "equipment",
      async () =>
        (await db.select().from(equipmentTable)).map((row) => row.slug),
    ],
    [
      "equipment_category",
      async () =>
        (await db.select().from(equipmentCategoryTable)).map((row) => row.slug),
    ],
    [
      "role",
      async () => (await db.select().from(rolesTable)).map((row) => row.name),
    ],
  ])("labels every seeded %s", async (kind, seededValues) => {
    expect(labelled(kind)).toEqual(sorted(await seededValues()));
  });

  it.each<[EnumKind, readonly string[]]>([
    ["listing_status", listingStatusEnum.enumValues],
    ["inspection_status", inspectionStatusEnum.enumValues],
    ["inspection_verdict", inspectionVerdictEnum.enumValues],
    ["mileage_consistency", mileageConsistencyEnum.enumValues],
    ["transmission", carTable.transmission.enumValues],
    ["inspection_category", inspectionCategorySchema.options],
    ["inspection_item_status", inspectionItemStatusSchema.options],
    ["listing_sort", getListingsQuerySchema.shape.sort.removeDefault().options],
  ])("labels every %s value", (kind, values) => {
    expect(labelled(kind)).toEqual(sorted(values));
  });
});
