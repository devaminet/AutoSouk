import { z } from "zod";

const invalidErrorMessage = "Make ID must be a positive integer";

export const getCarModelsParamsSchema = z.object({
  make_id: z.coerce
    .number({
      required_error: "Make ID is required",
      invalid_type_error: invalidErrorMessage,
    })
    .int()
    .positive(invalidErrorMessage),
});
