import { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { usersTable } from "../db/schema/user";
import { NotAllowedError } from "../errors/not_allowed";
import { NotAuthorizedError } from "../errors/not_authorized_error";

// Lets the request through only for users who verified their phone and whose
// face check an admin approved. The token doesn't carry these, so they are
// read from the database. Admins are exempt.
export const isIdentityVerified = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.currentUser) {
    return next(new NotAuthorizedError());
  }
  if (req.currentUser.role === "admin") {
    return next();
  }

  try {
    const [user] = await db
      .select({
        phoneVerifiedAt: usersTable.phoneVerifiedAt,
        identityStatus: usersTable.identityStatus,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.currentUser.id));
    if (!user?.phoneVerifiedAt || user.identityStatus !== "approved") {
      return next(new NotAllowedError("identity.required"));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

// Lets a mechanic send documents as soon as the face video is sent, so an
// admin reviews both together: phone verified, and the face check waiting or
// approved. Admins are exempt.
export const hasSentFaceCheck = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!req.currentUser) {
    return next(new NotAuthorizedError());
  }
  if (req.currentUser.role === "admin") {
    return next();
  }

  try {
    const [user] = await db
      .select({
        phoneVerifiedAt: usersTable.phoneVerifiedAt,
        identityStatus: usersTable.identityStatus,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.currentUser.id));
    if (
      !user?.phoneVerifiedAt ||
      (user.identityStatus !== "pending" && user.identityStatus !== "approved")
    ) {
      return next(new NotAllowedError("identity.face_check_required"));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};
