import { z } from "zod";
import { messageKey } from "../../i18n/zod_issues";
import { allowedImageTypes, getFileType } from "../../utils/functions";

const passwordSchema = z
  .string()
  .regex(
    new RegExp(
      "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#,;()$%^&*-/.])(?=.{8,})",
    ),
    messageKey("validation.password_strength"),
  );

const emailSchema = z.string().email();

export const registrationRoleSchema = z.enum(["buyer", "seller", "mechanic"]);

export const profileImageNameSchema = z.string().refine(
  (name) => getFileType(name) === "image",
  (filename) => ({
    message: messageKey("validation.image_type"),
    params: { filename, allowed: allowedImageTypes },
  }),
);

export const profileImageUploadSchema = z.object({
  imageName: profileImageNameSchema,
});

export const registerSchema = z.object({
  firstName: z.string().min(3),
  lastName: z.string().min(3),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().min(10),
  userType: registrationRoleSchema,
  cityId: z.number().min(1),
  imageName: profileImageNameSchema.optional(),
});

export const resendTokenSchema = z.object({
  email: emailSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z.object({
  token: z.string(),
  password: passwordSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  oldPassword: passwordSchema,
  password: passwordSchema,
  confirmPassword: passwordSchema,
});
