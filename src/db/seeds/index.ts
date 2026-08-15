import { generateCarCarburantData } from "./car_carburants_seed";
import { generateCarOriginsData } from "./car_origins_seed";
import { generateCarStatesData } from "./car_states_seed";
import { generateMakeAndModelData } from "./make_model_seed";

export const seeds = async () => {
  const results = await Promise.allSettled([
    generateMakeAndModelData(),
    generateCarOriginsData(),
    generateCarStatesData(),
    generateCarCarburantData(),
  ]);
  const success = results.every((result) => {
    if (result.status === "rejected") {
      console.log(result.reason);
    }
    return result.status === "fulfilled";
  });
  if (!success) {
    throw new Error("Failed to generate seeds");
  }
};
