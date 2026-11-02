import {
  findCarburants,
  findCarOrigins,
  findCarStates,
  findCities,
} from "./db";

export const getLookups = async () => {
  const [cities, carburants, states, origins] = await Promise.all([
    findCities(),
    findCarburants(),
    findCarStates(),
    findCarOrigins(),
  ]);
  return { cities, carburants, states, origins };
};
