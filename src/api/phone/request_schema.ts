import { z } from "zod";
import { phoneCodeLength } from "../../utils/constants";

export const verifyPhoneCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${phoneCodeLength}}$`)),
});
