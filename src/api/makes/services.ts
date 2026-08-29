import { findAllMakes } from "./db";

export const getMakes = async () => {
  const makes = await findAllMakes();

  return makes;
};
