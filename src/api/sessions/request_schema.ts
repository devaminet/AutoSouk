import { z } from "zod";
import { phoneCodeLength } from "../../utils/constants";

const challengeToken = z.string().regex(/^[a-f0-9]{64}$/);

export const twoFactorCodeSchema = z.object({
  challengeToken,
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${phoneCodeLength}}$`)),
});

export const twoFactorResendSchema = z.object({ challengeToken });

export const deviceIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const twoFactorSettingSchema = z.object({ enabled: z.boolean() });
