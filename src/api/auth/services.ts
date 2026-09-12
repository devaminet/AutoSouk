import { z } from "zod";
import {
  registerSchema,
  registrationRoleSchema,
  resetPasswordSchema,
} from "./request_schema";
import {
  generateJWT,
  generateToken,
  hashPassword,
  readTemplateFile,
  sanitizeUser,
  sendMail,
  verifyJWT,
  verifyPassword,
} from "../../utils/functions";
import { BadRequestError } from "../../errors/bad_request_error";
import { NotAuthorizedError } from "../../errors/not_authorized_error";
import { NotFoundError } from "../../errors/not_found_error";
import {
  createUser,
  deletePasswordResetToken,
  deletePasswordResetTokenByUserId,
  deleteRefreshToken,
  deleteVerificationToken,
  findPasswordResetToken,
  findReusedRefreshToken,
  findUserByEmail,
  findUserById,
  findUserRefreshToken,
  getVerificationToken,
  insertPasswordResetToken,
  insertUserRefreshToken,
  insertVerificationToken,
  updateRefreshToken,
  updateUserPassword,
  updateUserPasswordById,
  verifyUserById,
} from "./db";
import { tokenExpirationMinutes } from "../../utils/constants";
import { InternalServerError } from "../../errors/internal_server_error";

export const setupUser = async (user: z.infer<typeof registerSchema>) => {
  const { firstName, email } = user;
  const roleValidation = registrationRoleSchema.safeParse(user.userType);
  if (!roleValidation.success) {
    throw new BadRequestError(
      "User should be either buyer, seller or mechanic",
    );
  }

  const found = await findUserByEmail(email);
  if (found) {
    throw new BadRequestError("Email in use");
  }

  const createdUser = await createUser(user);
  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await insertVerificationToken(createdUser, token, expiresAt);
  const registerHTML = await readTemplateFile("register.ejs", {
    firstName,
    verificationUrl: `${process.env.BACKEND_URL}/api/auth/verify?token=${token}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: email,
    subject: "Verify Account",
    html: registerHTML,
  });

  return token;
};

export const resetPassword = async (
  data: z.infer<typeof resetPasswordSchema>,
) => {
  const { password, confirmPassword, oldPassword, email } = data;
  if (password !== confirmPassword) {
    throw new BadRequestError(
      "Password and confirm password should be the same",
    );
  }
  const user = await findUserByEmail(email);
  if (!user) {
    throw new BadRequestError("User not found");
  }
  const isPasswordValid = await verifyPassword(
    oldPassword,
    user.password,
    user.salt,
  );
  if (!isPasswordValid) {
    throw new BadRequestError("Invalid password");
  }
  const { hashedPassword, salt } = await hashPassword(password);
  const result = await updateUserPassword(email, hashedPassword, salt);

  return result;
};

export const loginUser = async (data: { email: string; password: string }) => {
  const { email, password } = data;
  const foundUser = await findUserByEmail(email);

  if (!foundUser) {
    throw new NotAuthorizedError("Email or password is not correct");
  }

  if (!foundUser.isVerified) {
    throw new NotAuthorizedError("Your account is not verified");
  }

  if (!foundUser.role) {
    throw new NotAuthorizedError("User role could not be resolved");
  }

  const { password: storedPassword, salt, ...user } = foundUser;
  const isPasswordValid = await verifyPassword(password, storedPassword, salt);

  if (!isPasswordValid) {
    throw new NotAuthorizedError("Email or password is not correct");
  }

  const accessToken = await generateJWT(
    {
      id: user.id,
      email: user.email,
      issuedAt: new Date().getTime(),
      role: user.role.name,
    },
    Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS!),
  );
  const refreshToken = await generateJWT(
    {
      id: user.id,
      email: user.email,
      issuedAt: new Date().getTime(),
      role: user.role.name,
    },
    Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!),
  );

  if (!refreshToken) {
    throw new InternalServerError("Failed to log the user in");
  }

  await insertUserRefreshToken(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
    user: sanitizeUser(foundUser),
  };
};

export const verifyUser = async (token: string) => {
  const tokenResponse = await getVerificationToken(token);
  if (!tokenResponse) {
    throw new BadRequestError("Invalid token");
  }
  const { expiresAt } = tokenResponse;
  const difference =
    (expiresAt.getTime() - new Date().getTime()) /
    1000 /
    60 /
    tokenExpirationMinutes;
  if (difference <= 0) {
    await deleteVerificationToken(token);
    throw new BadRequestError("Link has been expired");
  }
  const user = await findUserById(tokenResponse.userId);
  if (!user) {
    throw new NotAuthorizedError();
  }
  if (user.isVerified) {
    throw new BadRequestError("User is already verified");
  }
  await verifyUserById(tokenResponse.userId);
  await deleteVerificationToken(token);

  return { success: true };
};

export const resendVerificationEmail = async (email: string) => {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new NotFoundError("No account was found with this email");
  }
  if (user.isVerified) {
    throw new BadRequestError("User is already verified");
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await insertVerificationToken(user.id, token, expiresAt);

  const registerHTML = await readTemplateFile("register.ejs", {
    firstName: user.firstName,
    verificationUrl: `${process.env.BACKEND_URL}/api/auth/verify?token=${token}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: user.email,
    subject: "Verify Account",
    html: registerHTML,
  });

  return { success: true };
};

export const refreshTokens = async (token: string) => {
  const decoded = await verifyJWT<{ id: number; email: string; role: string }>(
    token,
  );

  // re-use detection
  const usedToken = await findReusedRefreshToken(token);
  if (usedToken) {
    await deleteRefreshToken(decoded.id);
    return { success: false };
  }

  const userToken = await findUserRefreshToken(decoded.id, token);
  if (!userToken) {
    await deleteRefreshToken(decoded.id);
    return { success: false };
  }

  const user = await findUserById(decoded.id);
  if (!user) {
    throw new NotFoundError("User was not found");
  }
  if (!user.role) {
    throw new NotAuthorizedError("User role could not be resolved");
  }

  const accessToken = await generateJWT(
    {
      id: user.id,
      email: user.email,
      issuedAt: new Date().getTime(),
      role: user.role.name,
    },
    Number(process.env.JWT_ACCESS_TOKEN_EXPIRATION_SECONDS!),
  );
  const refreshToken = await generateJWT(
    {
      id: user.id,
      email: user.email,
      issuedAt: new Date().getTime(),
      role: user.role.name,
    },
    Number(process.env.JWT_REFRESH_TOKEN_EXPIRATION_SECONDS!),
  );

  if (!refreshToken) {
    throw new InternalServerError("An error occurred");
  }
  await updateRefreshToken(decoded.id, token, refreshToken);
  return {
    success: true,
    refreshToken,
    accessToken,
    user: sanitizeUser(user),
  };
};

export const sendForgotPasswordLink = async (email: string) => {
  const foundUser = await findUserByEmail(email);

  if (!foundUser) {
    throw new NotFoundError("No account was registered with this email");
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);

  await insertPasswordResetToken(foundUser.id, token, expiresAt);

  const forgotPasswordHTML = await readTemplateFile("forgot_password.ejs", {
    firstName: foundUser.firstName,
    forgotPasswordUrl: `${process.env.BACKEND_URL}/api/auth/forgot-password?token=${token}&email=${email}`,
    expiration: `${tokenExpirationMinutes} minutes`,
  });
  await sendMail({
    to: email,
    subject: "Password reset request for your account",
    html: forgotPasswordHTML,
  });

  return { success: true };
};

export const verifyForgotPasswordToken = async (
  token: string,
  email: string,
) => {
  const result = await findPasswordResetToken(token);
  if (!result) {
    throw new BadRequestError("Invalid token");
  }
  const difference =
    new Date(result.expiresAt).getTime() - new Date().getTime();

  if (difference <= 0) {
    await deletePasswordResetToken(token);
    throw new BadRequestError("Link has been expired");
  }
  const user = await findUserById(result.userId);
  if (!user) {
    throw new NotFoundError();
  }
  if (user.email !== (email as string)) {
    throw new BadRequestError("Invalid token");
  }

  return { success: true };
};

export const updatePassword = async (token: string, password: string) => {
  const user = await findPasswordResetToken(token);
  if (!user) {
    throw new BadRequestError("Invalid token");
  }

  const { hashedPassword, salt } = await hashPassword(password);
  const result = await updateUserPasswordById(
    user.userId,
    hashedPassword,
    salt,
  );
  if (result === 0) {
    return { success: false };
  }
  await deletePasswordResetTokenByUserId(user.id);

  return { success: true };
};
