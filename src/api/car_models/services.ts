import { findMakeModels } from "./db";

export const getModels = async (makeId: number) => {
  return await findMakeModels(makeId);
};
