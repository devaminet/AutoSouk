import { z } from "zod";
import {
  registerSchema,
  registrationRoleSchema,
  resetPasswordSchema,
} from "./request_schema";
import {
  generateJWT,
  findObjectStat,
  generateImagePostPolicy,
  generateToken,
  getProfileImageUrl,
  hashPassword,
  readTemplateFile,
  removeObject,
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
  updateUserProfileImage,
  updateUserPassword,
  updateUserPasswordById,
  verifyUserById,
} from "./db";
import {
  maxProfileImageSizeBytes,
  profileImageUploadExpirationSeconds,
  tokenExpirationMinutes,
  usersBucketName,
} from "../../utils/constants";
import { InternalServerError } from "../../errors/internal_server_error";
import { Locale } from "../../i18n";
import { emailSubject, emailTemplateContext } from "../../i18n/emails";

const buildProfileImageName = (originalName: string) => {
  const extension = originalName.substring(originalName.lastIndexOf(".") + 1);
  return `profile-${generateToken(16)}.${extension.toLowerCase()}`;
};

const getProfileImageUpload = async (imageName: string) => {
  try {
    const { postURL, formData } = await generateImagePostPolicy(
      usersBucketName,
      imageName,
      maxProfileImageSizeBytes,
      profileImageUploadExpirationSeconds,
    );
    return { url: postURL, fields: formData };
  } catch (error) {
    console.error("Error generating profile image upload URL:", error);
    throw new InternalServerError("auth.profile_image_url_failed");
  }
};

type PendingImageUser = {
  id: number;
  imageName: string | null;
  pendingImageName: string | null;
};

const discardObject = async (filename: string) => {
  try {
    await removeObject(usersBucketName, filename);
  } catch (error) {
    console.error("Error removing profile image:", error);
  }
};

// Promote a pending image once the upload reached MinIO, otherwise keep the
// current image. A missing upload is not an error: the user keeps the previous
// (or default) image and can request a new upload url.
export const resolvePendingProfileImage = async (user: PendingImageUser) => {
  const { id, imageName, pendingImageName } = user;
  if (!pendingImageName) {
    return { imageName, uploaded: false };
  }

  const stat = await findObjectStat(usersBucketName, pendingImageName);
  if (!stat) {
    return { imageName, uploaded: false };
  }

  const contentType = stat.metaData?.["content-type"] ?? "";
  if (
    stat.size > maxProfileImageSizeBytes ||
    !contentType.startsWith("image/")
  ) {
    await discardObject(pendingImageName);
    await updateUserProfileImage(id, { pendingImageName: null });
    return { imageName, uploaded: false };
  }

  await updateUserProfileImage(id, {
    imageName: pendingImageName,
    pendingImageName: null,
  });
  if (imageName) {
    await discardObject(imageName);
  }

  return { imageName: pendingImageName, uploaded: true };
};

export const confirmProfileImage = async (userId: number) => {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotAuthorizedError();
  }
  if (!user.pendingImageName) {
    throw new BadRequestError("auth.profile_image_not_pending");
  }

  const { imageName, uploaded } = await resolvePendingProfileImage(user);
  if (!uploaded) {
    throw new BadRequestError("auth.profile_image_not_uploaded");
  }

  return { imageUrl: await getProfileImageUrl(imageName) };
};

export const requestProfileImageUpload = async (
  userId: number,
  originalName: string,
) => {
  const user = await findUserById(userId);
  if (!user) {
    throw new NotAuthorizedError();
  }

  if (user.pendingImageName) {
    await discardObject(user.pendingImageName);
  }

  const pendingImageName = buildProfileImageName(originalName);
  await updateUserProfileImage(userId, { pendingImageName });

  return { imageUpload: await getProfileImageUpload(pendingImageName) };
};

// Emails go out in the recipient's saved language, whatever the language of
// the request that triggered them.
const sendVerificationEmail = async (
  user: { email: string; firstName: string; locale: Locale },
  token: string,
) => {
  const registerHTML = await readTemplateFile("register.ejs", {
    ...emailTemplateContext(user.locale),
    firstName: user.firstName,
    verificationUrl: `${process.env.BACKEND_URL}/api/auth/verify?token=${token}`,
    expirationMinutes: tokenExpirationMinutes,
  });
  await sendMail({
    to: user.email,
    subject: emailSubject(user.locale, "register.subject"),
    html: registerHTML,
  });
};

export const setupUser = async (
  user: z.infer<typeof registerSchema>,
  locale: Locale,
) => {
  const { firstName, email } = user;
  const roleValidation = registrationRoleSchema.safeParse(user.userType);
  if (!roleValidation.success) {
    throw new BadRequestError("auth.invalid_signup_role");
  }

  const found = await findUserByEmail(email);
  if (found) {
    throw new BadRequestError("auth.email_in_use");
  }

  const imageName = user.imageName
    ? buildProfileImageName(user.imageName)
    : null;
  const createdUser = await createUser(user, locale, imageName);
  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await insertVerificationToken(createdUser, token, expiresAt);
  await sendVerificationEmail({ email, firstName, locale }, token);

  const imageUpload = imageName
    ? await getProfileImageUpload(imageName)
    : undefined;

  return { imageUpload };
};

export const resetPassword = async (
  data: z.infer<typeof resetPasswordSchema>,
) => {
  const { password, confirmPassword, oldPassword, email } = data;
  if (password !== confirmPassword) {
    throw new BadRequestError("auth.passwords_mismatch");
  }
  const user = await findUserByEmail(email);
  if (!user) {
    throw new BadRequestError("auth.user_not_found");
  }
  const isPasswordValid = await verifyPassword(
    oldPassword,
    user.password,
    user.salt,
  );
  if (!isPasswordValid) {
    throw new BadRequestError("auth.invalid_password");
  }
  const { hashedPassword, salt } = await hashPassword(password);
  const result = await updateUserPassword(email, hashedPassword, salt);

  return result;
};

export const loginUser = async (data: { email: string; password: string }) => {
  const { email, password } = data;
  const foundUser = await findUserByEmail(email);

  if (!foundUser) {
    throw new NotAuthorizedError("auth.invalid_credentials");
  }

  if (!foundUser.isVerified) {
    throw new NotAuthorizedError("auth.account_not_verified");
  }

  if (!foundUser.role) {
    throw new NotAuthorizedError("auth.role_unresolved");
  }

  const { password: storedPassword, salt, ...user } = foundUser;
  const isPasswordValid = await verifyPassword(password, storedPassword, salt);

  if (!isPasswordValid) {
    throw new NotAuthorizedError("auth.invalid_credentials");
  }

  const { imageName } = await resolvePendingProfileImage(foundUser);
  foundUser.imageName = imageName;

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
    throw new InternalServerError("auth.login_failed");
  }

  await insertUserRefreshToken(user.id, refreshToken);
  const sanitizedUser = await sanitizeUser(foundUser);

  return {
    accessToken,
    refreshToken,
    user: sanitizedUser,
  };
};

export const verifyUser = async (token: string) => {
  const tokenResponse = await getVerificationToken(token);
  if (!tokenResponse) {
    throw new BadRequestError("auth.token_invalid");
  }
  const { expiresAt } = tokenResponse;
  const difference =
    (expiresAt.getTime() - new Date().getTime()) /
    1000 /
    60 /
    tokenExpirationMinutes;
  if (difference <= 0) {
    await deleteVerificationToken(token);
    throw new BadRequestError("auth.link_expired");
  }
  const user = await findUserById(tokenResponse.userId);
  if (!user) {
    throw new NotAuthorizedError();
  }
  if (user.isVerified) {
    throw new BadRequestError("auth.already_verified");
  }
  await verifyUserById(tokenResponse.userId);
  await deleteVerificationToken(token);

  return { success: true };
};

export const resendVerificationEmail = async (email: string) => {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new NotFoundError("auth.email_not_found");
  }
  if (user.isVerified) {
    throw new BadRequestError("auth.already_verified");
  }

  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);
  const token = generateToken();

  await insertVerificationToken(user.id, token, expiresAt);

  await sendVerificationEmail(user, token);

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
    throw new NotFoundError("auth.user_not_found");
  }
  if (!user.role) {
    throw new NotAuthorizedError("auth.role_unresolved");
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
    throw new InternalServerError("internal");
  }
  await updateRefreshToken(decoded.id, token, refreshToken);
  const sanitizedUser = await sanitizeUser(user);

  return {
    success: true,
    refreshToken,
    accessToken,
    user: sanitizedUser,
  };
};

export const sendForgotPasswordLink = async (email: string) => {
  const foundUser = await findUserByEmail(email);

  if (!foundUser) {
    throw new NotFoundError("auth.email_not_found");
  }
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * tokenExpirationMinutes);

  await insertPasswordResetToken(foundUser.id, token, expiresAt);

  const forgotPasswordHTML = await readTemplateFile("forgot_password.ejs", {
    ...emailTemplateContext(foundUser.locale),
    firstName: foundUser.firstName,
    forgotPasswordUrl: `${process.env.BACKEND_URL}/api/auth/forgot-password?token=${token}&email=${email}`,
  });
  await sendMail({
    to: email,
    subject: emailSubject(foundUser.locale, "forgot_password.subject"),
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
    throw new BadRequestError("auth.token_invalid");
  }
  const difference =
    new Date(result.expiresAt).getTime() - new Date().getTime();

  if (difference <= 0) {
    await deletePasswordResetToken(token);
    throw new BadRequestError("auth.link_expired");
  }
  const user = await findUserById(result.userId);
  if (!user) {
    throw new NotFoundError();
  }
  if (user.email !== (email as string)) {
    throw new BadRequestError("auth.token_invalid");
  }

  return { success: true };
};

export const updatePassword = async (token: string, password: string) => {
  const user = await findPasswordResetToken(token);
  if (!user) {
    throw new BadRequestError("auth.token_invalid");
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
