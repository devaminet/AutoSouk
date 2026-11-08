import { asc } from "drizzle-orm";
import { db } from "../../db";
import { carOriginTable } from "../../db/schema/car_origin";
import { carCarburantTable } from "../../db/schema/carburant";
import { cityTable } from "../../db/schema/city";
import { carStateTable } from "../../db/schema/state";

export const findCities = async () => {
  return await db
    .select({
      id: cityTable.id,
      slug: cityTable.slug,
      name: cityTable.name,
      latitude: cityTable.latitude,
      longitude: cityTable.longitude,
      radiusKm: cityTable.radiusKm,
    })
    .from(cityTable)
    .orderBy(asc(cityTable.name));
};

export const findCarburants = async () => {
  return await db
    .select({ id: carCarburantTable.id, slug: carCarburantTable.carburant })
    .from(carCarburantTable)
    .orderBy(asc(carCarburantTable.id));
};

export const findCarStates = async () => {
  return await db
    .select({ id: carStateTable.id, slug: carStateTable.state })
    .from(carStateTable)
    .orderBy(asc(carStateTable.id));
};

export const findCarOrigins = async () => {
  return await db
    .select({ id: carOriginTable.id, slug: carOriginTable.origin })
    .from(carOriginTable)
    .orderBy(asc(carOriginTable.id));
};
