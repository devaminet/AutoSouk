import { z } from "zod";

export const registerSchema = z.object({
  firstName: z
    .string({
      required_error: "First name is required",
      invalid_type_error: "First name must be a text",
    })
    .min(3, { message: "First name should at least contain 3 charaters" }),
  lastName: z
    .string({
      required_error: "Last name is required",
      invalid_type_error: "Last name must be a text",
    })
    .min(3, { message: "Last name should at least contain 3 characters" }),
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a text",
    })
    .email({ message: "Invalid email address" }),
  password: z
    .string({
      required_error: "Password is required",
      invalid_type_error: "Password must be a text",
    })
    .regex(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#,;()$%^&*-/.])(?=.{8,})"
      ),
      {
        message:
          "Password must have more than 8 characters with lower case, upper case, numbers, and symbols",
      }
    ),
  phone: z
    .string({
      required_error: "Phone is required",
      invalid_type_error: "Phone must be a text",
    })
    .min(10, { message: "Phone should have at least 10 charaters" }),
  userType: z.enum(["buyer", "seller", "mechanic"], {
    message: "User should be either buyer, seller or mechanic",
  }),
  city: z
    .string({
      required_error: "City is required",
      invalid_type_error: "City must be a text",
    })
    .min(3, { message: "City should have at least three caracters" }),
});

export const resendTokenSchema = z.object({
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a text",
    })
    .email({ message: "Invalid email address" }),
});

export const loginSchema = z.object({
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a text",
    })
    .email({ message: "Invalid email address" }),
  password: z
    .string({
      required_error: "Password is required",
      invalid_type_error: "Password must be a text",
    })
    .regex(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#,;()$%^&*-/.])(?=.{8,})"
      ),
      {
        message:
          "Password must have more than 8 characters with lower case, upper case, numbers, and symbols",
      }
    ),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string({
    required_error: "Invalid request",
    invalid_type_error: "Invalid request",
  }),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a text",
    })
    .email({ message: "Invalid email address" }),
});

export const updatePasswordSchema = z.object({
  token: z.string({
    required_error: "Token is required",
    invalid_type_error: "Token must be a text",
  }),
  password: z
    .string({
      required_error: "Password is required",
      invalid_type_error: "Password must be a text",
    })
    .regex(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#,;()$%^&*-/.])(?=.{8,})"
      ),
      {
        message:
          "Password must have more than 8 characters with lower case, upper case, numbers, and symbols",
      }
    ),
});

export const resetPasswordSchema = z.object({
  email: z
    .string({
      required_error: "Email is required",
      invalid_type_error: "Email must be a text",
    })
    .email({ message: "Invalid email address" }),
  oldPassword: z
    .string({
      required_error: "Old password is required",
      invalid_type_error: "Old password must be a text",
    })
    .regex(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#,;()$%^&*-/.])(?=.{8,})"
      ),
      {
        message:
          "Password must have more than 8 characters with lower case, upper case, numbers, and symbols",
      }
    ),
  password: z
    .string({
      required_error: "Password is required",
      invalid_type_error: "Password must be a text",
    })
    .regex(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#,;()$%^&*-/.])(?=.{8,})"
      ),
      {
        message:
          "Password must have more than 8 characters with lower case, upper case, numbers, and symbols",
      }
    ),
  confirmPassword: z
    .string({
      required_error: "Confirm password is required",
      invalid_type_error: "Confirm password must be a text",
    })
    .regex(
      new RegExp(
        "^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#,;()$%^&*-/.])(?=.{8,})"
      ),
      {
        message:
          "Password must have more than 8 characters with lower case, upper case, numbers, and symbols",
      }
    ),
});
