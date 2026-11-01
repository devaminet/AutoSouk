import { z } from "zod";

export const getCarModelsParamsSchema = z.object({
  make_id: z.coerce.number().int().positive(),
});
