import { findEquipmentCatalog } from "./db";

export const getEquipmentCatalog = async () => {
  return await findEquipmentCatalog();
};
